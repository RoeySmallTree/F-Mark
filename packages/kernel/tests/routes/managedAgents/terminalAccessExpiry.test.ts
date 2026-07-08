import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { describe, expect, it } from "vitest";
import { registerAgent } from "../../../src/participants.js";
import { paths } from "../../../src/paths.js";
import { initProject } from "../../../src/project.js";
import { createSession } from "../../../src/sessions.js";
import { writeAccessRequestEvent } from "../../../src/services/events.js";
import { readEvents } from "../../../src/events/reader.js";
import { createAgentStateStoreForRoot } from "../../../src/services/agentState.js";
import { writeActiveSession } from "../../../src/agents/activeSession.js";
import { writeTmuxSession } from "../../../src/agents/managed.js";
import { ManagedAgentTerminalAccessService } from "../../../src/routes/managedAgents/terminalAccessService.js";
import { ManagedAgentTerminalPolling } from "../../../src/routes/managedAgents/terminalPolling.js";
import type { TmuxManager } from "../../../src/tmux/manager.js";
import type { BusMessage } from "../../../src/ws/bus.js";
import type { ManagedAgentRootBinding } from "../../../src/routes/managedAgents/types.js";

/* Spy tmux for the poller's pane-death branch. `paneAlive` returns the given
   verdict; `captureSnapshot` is counted so tests can assert the death branch
   does NOT capture. */
function makeSpyTmux(paneAliveResult: boolean) {
  const calls = { captureSnapshot: 0, paneAlive: 0 };
  const tmux = {
    paneAlive: async () => {
      calls.paneAlive += 1;
      return paneAliveResult;
    },
    captureSnapshot: async () => {
      calls.captureSnapshot += 1;
      return "";
    },
  } as unknown as TmuxManager;
  return { tmux, calls };
}

async function makeFixture(opts: { paneAlive?: boolean } = {}) {
  const { tmux, calls: tmuxCalls } = makeSpyTmux(opts.paneAlive ?? false);
  const root = await mkdtemp(join(tmpdir(), "fmark-term-expiry-"));
  const p = paths(root);
  await initProject(p);
  const participantId = "ag-claude-orphan";
  await registerAgent(p, {
    name: "Claude",
    suggested_id: participantId,
    runtime_id: "claude",
    knownRuntimeIds: new Set(["claude"]),
  });
  const session = await createSession(p, { slug: "orphan-run" });
  const state = createAgentStateStoreForRoot(root);
  await writeActiveSession(`${p.fmarkDir()}/agents`, participantId, session.id);
  const binding: ManagedAgentRootBinding = {
    paths: p,
    state,
    tmuxRoot: root,
    pathId: "path-a",
  };
  const messages: BusMessage[] = [];
  const updated: string[] = [];
  const terminalAccessService = new ManagedAgentTerminalAccessService({
    tmux,
    bus: { publish: (message) => messages.push(message) },
    bindingFor: () => binding,
    publishAgentUpdated: async (id) => {
      updated.push(id);
    },
  });
  const poller = new ManagedAgentTerminalPolling({
    tmux,
    terminalAccessService,
    bindingFor: () => binding,
  });
  return {
    binding,
    messages,
    p,
    participantId,
    poller,
    session,
    state,
    tmuxCalls,
    updated,
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

async function writeOpenTerminalRequest(
  fixture: Awaited<ReturnType<typeof makeFixture>>,
  requestId: string,
): Promise<void> {
  await writeAccessRequestEvent(fixture.p, fixture.session.id, {
    participant_id: fixture.participantId,
    schema: "fmark.access-request.v1",
    request_id: requestId,
    status: "open",
    request_type: "command",
    runtime_id: "claude",
    hook_event_name: "TerminalPermissionPrompt",
    title: "Bash command",
    command: "echo hi",
    suggestions: [
      { id: "terminal:1", label: "Yes", decision: "approve", terminal_input: "1" },
    ],
    response_channel: "terminal",
    raw: { terminal_fingerprint: "fp-orphan", tmux_session: "fmark-dead" },
    created_at: "2026-07-08T10:00:00.000Z",
  });
}

async function expiredResponseExists(
  fixture: Awaited<ReturnType<typeof makeFixture>>,
  requestId: string,
): Promise<boolean> {
  const events = await readEvents(fixture.p, fixture.session.id, {
    kinds: ["access-response"],
  });
  return events.some((event) => {
    if (event.kind !== "access-response") return false;
    const payload = event.payload as { request_id: string; status: string };
    return payload.request_id === requestId && payload.status === "expired";
  });
}

describe("ManagedAgentTerminalPolling — orphaned terminal request expiry", () => {
  it("expires an open terminal request when the poller finds the pane gone", async () => {
    const fixture = await makeFixture();
    try {
      await writeOpenTerminalRequest(fixture, "ar-terminal-orphan-1");

      fixture.poller.schedule({
        participantId: fixture.participantId,
        runtimeId: "claude",
        binding: fixture.binding,
      });
      await delay(1150);

      expect(await expiredResponseExists(fixture, "ar-terminal-orphan-1")).toBe(
        true,
      );
      expect(fixture.updated).toContain(fixture.participantId);
    } finally {
      await fixture.cleanup();
    }
  });

  it("expires when tmux reports the stored pane is dead (paneAlive=false)", async () => {
    const fixture = await makeFixture({ paneAlive: false });
    try {
      // State still points at a pane, but tmux says it is gone. This is the
      // branch the null-pointer tests do not reach.
      await writeTmuxSession(
        `${fixture.p.fmarkDir()}/agents`,
        fixture.participantId,
        "fmark-dead-pointer",
      );
      await writeOpenTerminalRequest(fixture, "ar-terminal-deadpane-1");

      fixture.poller.schedule({
        participantId: fixture.participantId,
        runtimeId: "claude",
        binding: fixture.binding,
      });
      await delay(1150);

      expect(await expiredResponseExists(fixture, "ar-terminal-deadpane-1")).toBe(
        true,
      );
      expect(fixture.tmuxCalls.paneAlive).toBeGreaterThan(0);
      // The death branch retires the request WITHOUT scraping a dead pane.
      expect(fixture.tmuxCalls.captureSnapshot).toBe(0);
    } finally {
      await fixture.cleanup();
    }
  });

  it("leaves an already-answered terminal request untouched", async () => {
    const fixture = await makeFixture();
    try {
      await writeOpenTerminalRequest(fixture, "ar-terminal-answered-1");
      await writeActiveSession(
        `${fixture.p.fmarkDir()}/agents`,
        fixture.participantId,
        fixture.session.id,
      );
      // Someone already responded — the poller must not write a second
      // (expired) response over a resolved request.
      const { writeAccessResponseEvent } = await import(
        "../../../src/services/events.js"
      );
      await writeAccessResponseEvent(fixture.p, fixture.session.id, {
        participant_id: fixture.participantId,
        schema: "fmark.access-response.v1",
        request_id: "ar-terminal-answered-1",
        decision: "approve",
        status: "approved",
        delivered: true,
        delivery: "terminal",
        responded_at: "2026-07-08T10:00:01.000Z",
      });

      fixture.poller.schedule({
        participantId: fixture.participantId,
        runtimeId: "claude",
        binding: fixture.binding,
      });
      await delay(1150);

      expect(await expiredResponseExists(fixture, "ar-terminal-answered-1")).toBe(
        false,
      );
    } finally {
      await fixture.cleanup();
    }
  });
});
