import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { reconcile } from "../src/reconcile.js";
import { initProject, readConfig, writeConfig } from "../src/project.js";
import { paths } from "../src/paths.js";
import {
  writeTmuxSession,
  readTmuxSession,
  readRuntime,
  writeRuntime,
} from "../src/agents/managed.js";
import { autoStreamHookCommand } from "../src/hooksInstall/command.js";
import { createPresenceTracker } from "../src/presence/tracker.js";
import { createAgentStateStore } from "../src/services/agentState.js";

interface FakeSession {
  sessionName: string;
  kind: "agent" | "terminal";
  participantId?: string;
  index?: number;
}

function fakeTmux(state: {
  sessions: FakeSession[];
  version?: { major: number; minor: number; raw: string } | null;
  paneAliveMap?: Record<string, boolean>;
  userOptionMap?: Record<string, string>;
}) {
  const killed: string[] = [];
  return {
    killed,
    async getVersion() {
      return state.version === undefined
        ? { major: 3, minor: 4, raw: "3.4" }
        : state.version;
    },
    async listFmarkSessions() {
      return state.sessions;
    },
    async killSession(name: string) {
      killed.push(name);
    },
    async paneAlive(name: string) {
      return state.paneAliveMap?.[name] ?? true;
    },
    async getUserOption(name: string, opt: string) {
      return state.userOptionMap?.[`${name}/${opt}`] ?? null;
    },
  };
}

async function makeFixture() {
  const root = await mkdtemp(join(tmpdir(), "fmark-rec-"));
  const p = paths(root);
  await initProject(p);
  return { root, paths: p };
}

describe("reconcile", () => {
  // HOME override so claude hookInstall lookups read a controlled settings.json
  // for the "hooks installed" survivor test. Restored after each test.
  let savedHome: string | undefined;
  beforeEach(() => {
    savedHome = process.env.HOME;
  });
  afterEach(() => {
    if (savedHome === undefined) delete process.env.HOME;
    else process.env.HOME = savedHome;
  });

  it("returns early when tmux is unavailable", async () => {
    const { paths: p } = await makeFixture();
    const tmux = fakeTmux({ sessions: [], version: null });
    const tracker = createPresenceTracker({ broadcast: () => {} });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await reconcile({ paths: p, tmux: tmux as any, tracker });
    expect(tmux.killed).toEqual([]);
    expect(tracker.snapshot().size).toBe(0);
  });

  it("CASE A: runtime with missing plugin surfaces hook-not-installed", async () => {
    const { paths: p } = await makeFixture();
    const fakeHome = await mkdtemp(join(tmpdir(), "fmark-oc-home-"));
    process.env.HOME = fakeHome;
    await writeTmuxSession(
      join(p.fmarkDir(), "agents"),
      "ag-opencode",
      "fmark-x-12345678-ag-ag-opencode",
    );
    await writeRuntime(join(p.fmarkDir(), "agents"), "ag-opencode", "opencode");

    const tmux = fakeTmux({
      sessions: [
        {
          sessionName: "fmark-x-12345678-ag-ag-opencode",
          kind: "agent",
          participantId: "ag-opencode",
        },
      ],
    });
    const tracker = createPresenceTracker({ broadcast: () => {} });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await reconcile({ paths: p, tmux: tmux as any, tracker });

    const s = tracker.snapshot().get("ag-opencode");
    expect(s).toBeDefined();
    expect(s?.state).toBe("hook-not-installed");
  });

  it("CASE A (hooks installed): surviving managed agent with installed hooks → tracker state 'stale'", async () => {
    const { paths: p } = await makeFixture();

    // Pin the user participant id so we can write a matching claude
    // settings.json snippet below. initProject seeds a random us-XXXX user;
    // overwrite that with a fixed id.
    const cfg = await readConfig(p);
    cfg.participants = {
      "us-test": { kind: "user", name: "You", color: "#0EA5E9" },
    };
    await writeConfig(p, cfg);

    await writeTmuxSession(
      join(p.fmarkDir(), "agents"),
      "ag-claude",
      "fmark-x-12345678-ag-ag-claude",
    );
    await writeRuntime(join(p.fmarkDir(), "agents"), "ag-claude", "claude");

    // Stand up a fake HOME with a ~/.claude/settings.json that records the
    // generic f-mark hooks so detectClaudeHooks reports installed=true.
    const fakeHome = await mkdtemp(join(tmpdir(), "fmark-home-"));
    await mkdir(join(fakeHome, ".claude"), { recursive: true });
    await writeFile(
      join(fakeHome, ".claude", "settings.json"),
      JSON.stringify({
        hooks: {
          Stop: [
            {
              hooks: [
                {
                  type: "command",
                  command: autoStreamHookCommand(),
                },
              ],
            },
          ],
          PermissionRequest: [
            {
              hooks: [
                {
                  type: "command",
                  command: autoStreamHookCommand(),
                },
              ],
            },
          ],
          /* `managed-only-v3` requires live hooks for the install to be
             reported as `installed`. */
          PostToolUse: [
            {
              hooks: [
                {
                  type: "command",
                  command: autoStreamHookCommand(),
                },
              ],
            },
          ],
          MessageDisplay: [
            {
              hooks: [
                {
                  type: "command",
                  command: autoStreamHookCommand(),
                },
              ],
            },
          ],
        },
      }),
      "utf8",
    );
    process.env.HOME = fakeHome;

    const tmux = fakeTmux({
      sessions: [
        {
          sessionName: "fmark-x-12345678-ag-ag-claude",
          kind: "agent",
          participantId: "ag-claude",
        },
      ],
    });
    const tracker = createPresenceTracker({ broadcast: () => {} });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await reconcile({ paths: p, tmux: tmux as any, tracker });

    const s = tracker.snapshot().get("ag-claude");
    expect(s).toBeDefined();
    expect(s?.state).toBe("stale");
  });

  it("CASE A (codex): surviving codex agent → 'stale' without any ~/.codex/hooks.json (hooks are injected per launch)", async () => {
    const { paths: p } = await makeFixture();

    await writeTmuxSession(
      join(p.fmarkDir(), "agents"),
      "ag-codex",
      "fmark-x-12345678-ag-ag-codex",
    );
    await writeRuntime(join(p.fmarkDir(), "agents"), "ag-codex", "codex");

    // Empty fake HOME: no ~/.codex/hooks.json at all. A codex pane carries its
    // hooks in the launch argv, so reconcile must not report hook-not-installed.
    const fakeHome = await mkdtemp(join(tmpdir(), "fmark-home-codex-"));
    process.env.HOME = fakeHome;

    const tmux = fakeTmux({
      sessions: [
        {
          sessionName: "fmark-x-12345678-ag-ag-codex",
          kind: "agent",
          participantId: "ag-codex",
        },
      ],
    });
    const tracker = createPresenceTracker({ broadcast: () => {} });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await reconcile({ paths: p, tmux: tmux as any, tracker });

    const s = tracker.snapshot().get("ag-codex");
    expect(s).toBeDefined();
    expect(s?.state).toBe("stale");
  });

  it("CASE B: agent dir without live tmux session → preserve resume state + mark pane dead", async () => {
    const { paths: p } = await makeFixture();
    const state = createAgentStateStore({ fallback: p });
    await writeTmuxSession(
      join(p.fmarkDir(), "agents"),
      "ag-claude",
      "fmark-x-12345678-ag-ag-claude",
    );
    await writeRuntime(join(p.fmarkDir(), "agents"), "ag-claude", "claude");
    await state.writeActiveSession("ag-claude", "sess-1");
    await state.writeRuntimeSession("ag-claude", {
      desired_name: "sess-1",
      native_name_applied: true,
      native_session_id: "claude-native-1",
      native_transcript_path: "/tmp/claude.jsonl",
      native_id_source: "hook",
    });
    // Pre-write a log entry so we can check that it's preserved (not wiped)
    await writeFile(
      join(p.fmarkDir(), "agents", "ag-claude", "log.jsonl"),
      '{"event":"spawn"}\n',
    );

    const tmux = fakeTmux({ sessions: [] }); // NO surviving tmux session
    const tracker = createPresenceTracker({ broadcast: () => {} });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await reconcile({ paths: p, tmux: tmux as any, tracker });

    // Resume-critical pointers are preserved for provider-native resume.
    expect(await readTmuxSession(join(p.fmarkDir(), "agents"), "ag-claude")).toBe(
      "fmark-x-12345678-ag-ag-claude",
    );
    expect(await readRuntime(join(p.fmarkDir(), "agents"), "ag-claude")).toBe(
      "claude",
    );
    expect(await state.readRuntimeSession("ag-claude")).toMatchObject({
      native_session_id: "claude-native-1",
      native_transcript_path: "/tmp/claude.jsonl",
    });
    expect(await state.readControlState("ag-claude")).toMatchObject({
      pane_lifecycle: "dead",
      last_tmux_session: "fmark-x-12345678-ag-ag-claude",
    });
    // log.jsonl should still exist and contain pane-died entry alongside original
    const logTxt = await readFile(
      join(p.fmarkDir(), "agents", "ag-claude", "log.jsonl"),
      "utf8",
    );
    expect(logTxt).toContain("spawn");
    expect(logTxt).toContain("pane-died");
    // Tracker should surface the dead-pane agent so the dashboard can show
    // it as "pane-dead" (not "launching" or absent).
    const s = tracker.snapshot().get("ag-claude");
    expect(s).toBeDefined();
    expect(s?.state).toBe("pane-dead");
  });

  it("CASE C: orphan agent session (tmux exists but no agent dir) → kill session", async () => {
    const { paths: p } = await makeFixture();
    // NO .f-mark/agents/ag-orphan/ created

    const tmux = fakeTmux({
      sessions: [
        {
          sessionName: "fmark-x-12345678-ag-ag-orphan",
          kind: "agent",
          participantId: "ag-orphan",
        },
      ],
    });
    const tracker = createPresenceTracker({ broadcast: () => {} });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await reconcile({ paths: p, tmux: tmux as any, tracker });

    expect(tmux.killed).toContain("fmark-x-12345678-ag-ag-orphan");
  });

  it("terminal sessions are kept (not killed) during reconcile", async () => {
    const { paths: p } = await makeFixture();
    const tmux = fakeTmux({
      sessions: [
        {
          sessionName: "fmark-x-12345678-term-1",
          kind: "terminal",
          index: 1,
        },
      ],
    });
    const tracker = createPresenceTracker({ broadcast: () => {} });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await reconcile({ paths: p, tmux: tmux as any, tracker });
    expect(tmux.killed).toEqual([]);
  });
});
