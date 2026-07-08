import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { describe, expect, it } from "vitest";
import { listParticipants, registerAgent } from "../../../src/participants.js";
import { paths } from "../../../src/paths.js";
import { initProject } from "../../../src/project.js";
import { writeProseEvent, writeTurnEndEvent } from "../../../src/services/events.js";
import { createAgentStateStoreForRoot } from "../../../src/services/agentState.js";
import { ManagedAgentCodexLiveTextPolling } from "../../../src/routes/managedAgents/codexLiveTextPolling.js";
import type { BusMessage } from "../../../src/ws/bus.js";
import type { ManagedAgentRootBinding } from "../../../src/routes/managedAgents/types.js";
import { createSession, renameSession } from "../../../src/sessions.js";

async function writeRollout(input: {
  codexHome: string;
  projectRoot: string;
  participantId: string;
  sessionId: string;
  content: string;
  timestamp: string;
}): Promise<void> {
  const dir = join(input.codexHome, "sessions", "2026", "07", "05");
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, "rollout-2026-07-05T10-00-00-live.jsonl"),
    [
      {
        type: "session_meta",
        payload: { id: "codex-live", cwd: input.projectRoot },
      },
      {
        type: "response_item",
        payload: {
          type: "message",
          role: "user",
          content: [
            {
              type: "input_text",
              text: `<!-- fmark:launch-prompt:v1 --> fmark.launch ${input.participantId} ${input.sessionId}`,
            },
          ],
        },
      },
      {
        timestamp: input.timestamp,
        type: "event_msg",
        payload: {
          type: "agent_message",
          phase: "commentary",
          message: input.content,
        },
      },
    ].map((line) => JSON.stringify(line)).join("\n") + "\n",
    "utf8",
  );
}

async function makeFixture() {
  const root = await mkdtemp(join(tmpdir(), "fmark-codex-poll-"));
  const codexHome = join(root, "codex-home");
  await mkdir(codexHome, { recursive: true });
  const p = paths(root);
  await initProject(p);
  await registerAgent(p, { name: "Codex", suggested_id: "ag-codex" });
  const participants = await listParticipants(p);
  const userId =
    Object.entries(participants).find(([, participant]) => participant.kind === "user")?.[0] ??
    "us-missing";
  const session = await createSession(p, { slug: "run" });
  const state = createAgentStateStoreForRoot(root);
  const binding: ManagedAgentRootBinding = {
    paths: p,
    state,
    tmuxRoot: root,
    pathId: "path-a",
  };
  const messages: BusMessage[] = [];
  const updated: string[] = [];
  const poller = new ManagedAgentCodexLiveTextPolling({
    bus: { publish: (message) => messages.push(message) },
    integrationEnv: { CODEX_HOME: codexHome },
    bindingFor: () => binding,
    publishAgentUpdated: async (participantId) => {
      updated.push(participantId);
    },
  });
  return {
    binding,
    codexHome,
    messages,
    p,
    poller,
    root,
    session,
    state,
    updated,
    userId,
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

describe("ManagedAgentCodexLiveTextPolling", () => {
  it("suppresses Codex live text after a manual agent turn-end closes the turn", async () => {
    const fixture = await makeFixture();
    try {
      await writeTurnEndEvent(fixture.p, fixture.session.id, {
        participant_id: "ag-codex",
        source: "manual",
      });
      await writeRollout({
        codexHome: fixture.codexHome,
        projectRoot: fixture.root,
        participantId: "ag-codex",
        sessionId: fixture.session.id,
        content: "late text after stop",
        timestamp: new Date(Date.now()).toISOString(),
      });

      fixture.poller.schedule({
        participantId: "ag-codex",
        sessionId: fixture.session.id,
        runtimeId: "codex",
        binding: fixture.binding,
      });
      await delay(1150);

      expect(
        fixture.messages.some(
          (message) => message.type === "event_added" && message.kind === "prose",
        ),
      ).toBe(false);
      await expect(fixture.state.readControlState("ag-codex")).resolves.not.toMatchObject({
        activity_state: "running",
      });
      expect(fixture.updated).toEqual([]);
    } finally {
      await fixture.cleanup();
    }
  });

  it("allows Codex live text after newer user activity reopens the turn", async () => {
    const fixture = await makeFixture();
    try {
      await writeTurnEndEvent(fixture.p, fixture.session.id, {
        participant_id: "ag-codex",
        source: "manual",
      });
      await delay(20);
      await writeProseEvent(fixture.p, fixture.session.id, {
        participant_id: fixture.userId,
        content: "next request",
      });
      await writeRollout({
        codexHome: fixture.codexHome,
        projectRoot: fixture.root,
        participantId: "ag-codex",
        sessionId: fixture.session.id,
        content: "fresh live text",
        timestamp: new Date(Date.now()).toISOString(),
      });

      fixture.poller.schedule({
        participantId: "ag-codex",
        sessionId: fixture.session.id,
        runtimeId: "codex",
        binding: fixture.binding,
      });
      await delay(1150);

      expect(
        fixture.messages.some(
          (message) =>
            message.type === "event_added" &&
            message.kind === "prose" &&
            message.participant_id === "ag-codex",
        ),
      ).toBe(true);
      await expect(fixture.state.readControlState("ag-codex")).resolves.toMatchObject({
        activity_state: "running",
      });
      expect(fixture.updated).toEqual(["ag-codex"]);
    } finally {
      await fixture.cleanup();
    }
  });
});

describe("ManagedAgentCodexLiveTextPolling rename stability", () => {
  it("keeps streaming across a mid-launch rename because the session id is immutable", async () => {
    const fixture = await makeFixture();
    try {
      await writeRollout({
        codexHome: fixture.codexHome,
        projectRoot: fixture.root,
        participantId: "ag-codex",
        sessionId: fixture.session.id,
        content: "launch commentary line",
        timestamp: new Date().toISOString(),
      });
      fixture.poller.schedule({
        participantId: "ag-codex",
        sessionId: fixture.session.id,
        runtimeId: "codex",
        binding: fixture.binding,
      });

      // fmark_rename_session mid-launch: only the meta slug changes.
      const renamed = await renameSession(fixture.p, fixture.session.id, {
        slug: "renamed-run",
      });
      expect(renamed.id).toBe(fixture.session.id);
      expect(renamed.slug).toBe("renamed-run");

      await delay(2400);

      const prose = fixture.messages.filter(
        (message) =>
          message.type === "event_added" &&
          message.kind === "prose" &&
          message.session_id === fixture.session.id,
      );
      expect(prose.length).toBe(1);
    } finally {
      await fixture.cleanup();
    }
  });
});
