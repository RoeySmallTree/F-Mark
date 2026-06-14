import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { initProject } from "../../src/project.js";
import { paths } from "../../src/paths.js";
import { createSession } from "../../src/sessions.js";
import { listParticipants } from "../../src/participants.js";
import { withTempProject } from "../helpers/tempdir.js";
import {
  writeProseEvent,
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
});
