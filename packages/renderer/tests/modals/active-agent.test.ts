/* Unit tests for the Skills-palette active-agent resolution.

   Focus: the palette must reflect the agent BOUND TO THE CURRENT SESSION
   (its runtime_id), not a stale global localStorage choice or a last-match
   heuristic over every participant ever registered. This is the
   "doesn't understand the agent is claude" bug. Also covers opencode
   being a first-class agent key. */

import { afterEach, describe, expect, test } from "vitest";
import type { Participant } from "@f-mark/shared";
import {
  ACTIVE_AGENT_STORAGE_KEY,
  AGENT_LABELS,
  KNOWN_AGENT_KEYS,
  resolveActiveAgent,
  sessionAgentKey,
} from "../../src/modals/skills/active-agent.js";

afterEach(() => {
  globalThis.localStorage?.clear();
});

describe("opencode is a first-class agent key", () => {
  test("KNOWN_AGENT_KEYS + AGENT_LABELS include opencode", () => {
    expect(KNOWN_AGENT_KEYS).toContain("opencode");
    expect(AGENT_LABELS.opencode).toBe("Opencode");
  });
});

describe("sessionAgentKey — the canonical signal", () => {
  const SID = "2026-05-30-demo";

  test("returns the runtime of the agent bound to the session", () => {
    const p: Record<string, Participant> = {
      "us-1": { kind: "user", name: "You", color: "#000", active_session: null },
      "ag-codex-aa": { kind: "agent", name: "Codex", color: "#111", runtime_id: "codex", active_session: "other-session" },
      "ag-claude-bb": { kind: "agent", name: "Claude", color: "#222", runtime_id: "claude", active_session: SID },
    };
    expect(sessionAgentKey(p, SID)).toBe("claude");
  });

  test("resolves opencode runtime when that agent is bound", () => {
    const p: Record<string, Participant> = {
      "ag-oc-xy": { kind: "agent", name: "Opencode", color: "#333", runtime_id: "opencode", active_session: SID },
    };
    expect(sessionAgentKey(p, SID)).toBe("opencode");
  });

  test("falls back to id prefix for legacy agents without runtime_id", () => {
    const p: Record<string, Participant> = {
      "ag-opencode-zz": { kind: "agent", name: "Opencode", color: "#444", active_session: SID },
    };
    expect(sessionAgentKey(p, SID)).toBe("opencode");
  });

  test("returns null when no agent is bound to the session", () => {
    const p: Record<string, Participant> = {
      "ag-codex-aa": { kind: "agent", name: "Codex", color: "#111", runtime_id: "codex", active_session: "other" },
    };
    expect(sessionAgentKey(p, SID)).toBeNull();
  });
});

describe("resolveActiveAgent — session binding beats stale localStorage", () => {
  const SID = "2026-05-30-demo";

  test("session-bound claude wins even when localStorage says codex", () => {
    globalThis.localStorage?.setItem(ACTIVE_AGENT_STORAGE_KEY, "codex");
    const p: Record<string, Participant> = {
      "ag-claude-bb": { kind: "agent", name: "Claude", color: "#222", runtime_id: "claude", active_session: SID },
    };
    expect(resolveActiveAgent(p, SID)).toBe("claude");
  });

  test("with no session-bound agent, stored choice still applies", () => {
    globalThis.localStorage?.setItem(ACTIVE_AGENT_STORAGE_KEY, "codex");
    const p: Record<string, Participant> = {
      "ag-claude-bb": { kind: "agent", name: "Claude", color: "#222", runtime_id: "claude", active_session: "other" },
    };
    expect(resolveActiveAgent(p, SID)).toBe("codex");
  });

  test("defaults to claude when nothing else resolves", () => {
    expect(resolveActiveAgent({}, null)).toBe("claude");
  });
});
