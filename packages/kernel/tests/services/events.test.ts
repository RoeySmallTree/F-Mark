import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { initProject } from "../../src/project.js";
import { paths } from "../../src/paths.js";
import { createSession } from "../../src/sessions.js";
import { listParticipants } from "../../src/participants.js";
import { withTempProject } from "../helpers/tempdir.js";
import {
  writeAccessRequestEvent,
  writeChoiceEvent,
  writeChoicesEvent,
  writeFlowEvent,
  writeProseEvent,
  writeSubagentRunEvent,
  writeTodoEvent,
} from "../../src/services/events.js";
import { publishEventWrites } from "../../src/services/eventPublisher.js";
import type { BusMessage } from "../../src/ws/bus.js";

async function setup(root: string) {
  const p = paths(root);
  await initProject(p);
  const session = await createSession(p, { slug: "svc" });
  const [pid] = Object.keys(await listParticipants(p));
  return { p, sessionId: session.id, pid: pid! };
}

describe("event services", () => {
  it("writes a file comment (file_path + lines) to disk", async () => {
    await withTempProject(async (root) => {
      const { p, sessionId, pid } = await setup(root);

      const comment = await writeProseEvent(p, sessionId, {
        participant_id: pid,
        content: "Comment",
        file_path: "src/app.ts",
        lines: [1, 1],
        diff_base: "current-session",
      });

      expect(comment.response.kind).toBe("prose");
      expect(comment.publish).toEqual([
        {
          filename: comment.response.filename,
          kind: "prose",
          participantId: pid,
          supersedes: undefined,
        },
      ]);
      const onDisk = await readFile(
        join(p.sessionDir(sessionId), comment.response.filename),
        "utf8",
      );
      expect(onDisk).toContain("file_path: src/app.ts");
      expect(onDisk).toContain("lines:");
      expect(onDisk).toContain("diff_base: current-session");
      expect(onDisk).not.toContain("append_to:");
    });
  });

  it("returns publish records for todo removal cascades", async () => {
    await withTempProject(async (root) => {
      const { p, sessionId, pid } = await setup(root);
      await writeTodoEvent(p, sessionId, {
        participant_id: pid,
        id: "parent",
        title: "Parent",
        status: "open",
      });
      await writeTodoEvent(p, sessionId, {
        participant_id: pid,
        id: "child",
        title: "Child",
        status: "open",
        parent_id: "parent",
      });
      await writeTodoEvent(p, sessionId, {
        participant_id: pid,
        id: "grandchild",
        title: "Grandchild",
        status: "open",
        parent_id: "child",
      });

      const removal = await writeTodoEvent(p, sessionId, {
        participant_id: pid,
        id: "parent",
        title: "Parent",
        status: "removed",
      });

      expect(removal.response.kind).toBe("todo");
      expect(removal.publish).toHaveLength(3);
      expect(removal.publish.map((record) => record.kind)).toEqual([
        "todo",
        "todo",
        "todo",
      ]);
      expect(removal.publish.slice(1).every((record) => record.supersedes))
        .toBe(true);
    });
  });

  it("publishes event_added and event_superseded envelopes", () => {
    const messages: BusMessage[] = [];
    publishEventWrites(
      { publish: (message) => messages.push(message) },
      "session-1",
      [
        {
          filename: "20260525T000000Z_us-1234.prose.md",
          kind: "prose",
          participantId: "us-1234",
          supersedes: "20260524T000000Z_us-1234.prose.md",
        },
      ],
    );

    expect(messages).toEqual([
      {
        type: "event_added",
        session_id: "session-1",
        filename: "20260525T000000Z_us-1234.prose.md",
        kind: "prose",
        participant_id: "us-1234",
      },
      {
        type: "event_superseded",
        session_id: "session-1",
        filename: "20260524T000000Z_us-1234.prose.md",
        supersedes: "20260525T000000Z_us-1234.prose.md",
      },
    ]);
  });

  /* X2 / review finding 7: scope routing fields (root, path_id, legacy path)
     are transport-only and must never land in durable event JSON, even though
     route bodies now carry them and several serializers spread the remainder
     of the body. */
  it("strips root/path_id/path from persisted event JSON", async () => {
    await withTempProject(async (root) => {
      const { p, sessionId, pid } = await setup(root);
      const scope = {
        root,
        path_id: "deadbeef0000",
        path: root,
      } as const;

      const readJson = async (filename: string): Promise<string> =>
        readFile(join(p.sessionDir(sessionId), filename), "utf8");
      const assertNoScope = (raw: string, label: string): void => {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        expect(parsed.root, `${label}.root`).toBeUndefined();
        expect(parsed.path_id, `${label}.path_id`).toBeUndefined();
        expect(parsed.path, `${label}.path`).toBeUndefined();
      };

      const choices = await writeChoicesEvent(p, sessionId, {
        ...scope,
        participant_id: pid,
        id: "ch1",
        question: "Q",
        options: [{ id: "o1", label: "A" }],
        multi: false,
      } as Parameters<typeof writeChoicesEvent>[2]);
      assertNoScope(await readJson(choices.response.filename), "choices");

      const choice = await writeChoiceEvent(p, sessionId, {
        ...scope,
        participant_id: pid,
        choices_id: "ch1",
        selected: ["o1"],
      } as Parameters<typeof writeChoiceEvent>[2]);
      assertNoScope(await readJson(choice.response.filename), "choice");

      const flow = await writeFlowEvent(p, sessionId, {
        ...scope,
        participant_id: pid,
        id: "f1",
        nodes: [],
        edges: [],
      } as Parameters<typeof writeFlowEvent>[2]);
      assertNoScope(await readJson(flow.response.filename), "flow");

      const subagent = await writeSubagentRunEvent(p, sessionId, {
        ...scope,
        participant_id: pid,
        schema: "fmark.subagent-run.v1",
        parent_participant_id: pid,
        parent_runtime_id: null,
        subagent_id: "sa1",
        name: "Sub",
        status: "started",
        correlation_id: "c1",
        sequence: 0,
        source: "hook",
        source_confidence: "high",
      } as Parameters<typeof writeSubagentRunEvent>[2]);
      assertNoScope(await readJson(subagent.response.filename), "subagent-run");

      const access = await writeAccessRequestEvent(p, sessionId, {
        ...scope,
        participant_id: pid,
        schema: "fmark.access-request.v1",
        request_id: "r1",
        status: "open",
        request_type: "permission",
        runtime_id: null,
        hook_event_name: "PreToolUse",
        title: "Allow?",
        response_channel: "hook",
        created_at: "20260613T000000Z",
      } as Parameters<typeof writeAccessRequestEvent>[2]);
      assertNoScope(await readJson(access.response.filename), "access-request");
    });
  });
});
