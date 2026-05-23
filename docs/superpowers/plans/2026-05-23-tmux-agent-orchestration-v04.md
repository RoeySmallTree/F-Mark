# Tmux Agent Orchestration (v0.4) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Each phase ends with a `/buddy` verification pass that independently checks the work actually does what the task claims.

**Goal:** Add tmux-orchestrated agent sessions to F-Mark — kernel can spawn, supervise, surface, and remotely control Claude Code / Codex / Gemini CLI agents from the F-Mark UI, while preserving the shipped v0.3.0 auto-stream backbone.

**Architecture:** Strictly additive on v0.3.0. New `Tmux Manager`, `Runtime Registry`, `Presence Tracker`, `Pane WS subsystem`, `Managed-Agent + Terminal API`. Presence is TTL + tmux liveness (no daemon). Inbound control via `tmux send-keys` framed as best-effort. Hook installation is read-only detection + manual-paste instructions. Per-runtime hookConfig + telemetry are deferred to v0.5 / v0.6.

**Tech Stack:** TypeScript (kernel, renderer, shared). Fastify routes + `@fastify/websocket`. Vitest (kernel + renderer). React 18 + Zustand (renderer). xterm.js for the terminal overlay. Node 18+ built-in `fetch`, `node:crypto`, `node:fs/promises`. No new platform deps beyond tmux ≥3.0.

**Spec:** `docs/superpowers/specs/2026-05-23-tmux-agent-orchestration-design.md` (read first; this plan does not duplicate spec content).

**Buddy review of spec:** `planning/buddy-reviews/2026-05-23-tmux-orchestration-review.md`.

---

## Scope Check

The spec is a single coherent feature: process orchestration for the F-Mark kernel. It is large (16 phases, ~50 tasks) but the parts are sequentially dependent — Tmux Manager + Runtime Registry must exist before routes; routes must exist before UI; reconcile depends on routes; everything depends on the regression tripwire passing. Decomposing further would create artificial seams. Plan it as one feature, ship in phases via incremental commits, each phase guarded by buddy verification.

---

## File Structure

### New kernel modules

| Path | Responsibility |
|---|---|
| `packages/kernel/src/tmux/commandRunner.ts` | Injectable `exec`/`spawn` wrapper for testability |
| `packages/kernel/src/tmux/naming.ts` | Path-hash, slug, F-Mark prefix, validators |
| `packages/kernel/src/tmux/manager.ts` | Spawn/list/kill sessions; user-option set/get; capture-pane; pipe-pane |
| `packages/kernel/src/tmux/inputQueue.ts` | Per-pane FIFO for send-keys |
| `packages/kernel/src/runtimes/defaults.ts` | Built-in claude/codex/gemini defaults |
| `packages/kernel/src/runtimes/validation.ts` | Executable + args + slash + message text validators |
| `packages/kernel/src/runtimes/registry.ts` | Load/save `.f-mark/runtimes.json`; CRUD |
| `packages/kernel/src/presence/tracker.ts` | In-memory state map + transitions + broadcast |
| `packages/kernel/src/agents/managed.ts` | Sibling files (`tmux-session`, `runtime`) |
| `packages/kernel/src/agents/logs.ts` | `log.jsonl` writer with rotation + reader |
| `packages/kernel/src/hooksInstall/types.ts` | Shared types for hook install adapters |
| `packages/kernel/src/hooksInstall/claude.ts` | Parse `~/.claude/settings.json` |
| `packages/kernel/src/hooksInstall/codex.ts` | Parse `~/.codex/config.toml` + project-local |
| `packages/kernel/src/hooksInstall/gemini.ts` | v0.4 stub: always reports "manual-stream mode, no hooks needed" |
| `packages/kernel/src/hooksInstall/index.ts` | Dispatch by runtime_id; renders manual install instructions |
| `packages/kernel/src/routes/managedAgents.ts` | Spawn/kill/list/terminal/logs/confirm-token routes |
| `packages/kernel/src/routes/presence.ts` | `POST /agents/:id/ping` |
| `packages/kernel/src/routes/envProbe.ts` | `GET /env-probe` |
| `packages/kernel/src/routes/hookInstall.ts` | `GET /managed-agents/hook-install-status`, `POST /managed-agents/hook-install-instructions` |
| `packages/kernel/src/ws/pane.ts` | `/ws/pane` channel + in-memory pipe-pane fan-out |
| `packages/kernel/src/reconcile.ts` | Startup reconciliation of surviving tmux sessions |

### Modified kernel files

| Path | Change |
|---|---|
| `packages/kernel/src/hooks/autoStream.ts` | Add ping POST at start of each fire |
| `packages/kernel/src/routes/guide.ts` | Accept `agent_id` + `runtime_id`; alias `sessionId`; remove "NOT YET SHIPPED" text |
| `packages/kernel/src/server.ts` | Register new routes; wire pane WS |
| `packages/kernel/src/cli.ts` | Add `--allow-process-api-no-auth` flag |
| `packages/kernel/src/project.ts` | `initProject` writes `runtimes.json` defaults |
| `packages/kernel/src/index.ts` | Call `reconcile()` after server start |
| `packages/kernel/src/banner.ts` | Warn when `--no-auth` + `--allow-process-api-no-auth` both set |

### New renderer modules

| Path | Responsibility |
|---|---|
| `packages/renderer/src/api/managedAgents.ts` | HTTP client for new routes |
| `packages/renderer/src/state/presence.ts` | Zustand slice for presence + managed agents |
| `packages/renderer/src/components/AgentChip.tsx` | Agent chip with state dot |
| `packages/renderer/src/components/TerminalChip.tsx` | Terminal chip |
| `packages/renderer/src/components/PlusButton.tsx` | + dropdown |
| `packages/renderer/src/components/AgentActionMenu.tsx` | Per-agent menu |
| `packages/renderer/src/components/EnvProbeBanner.tsx` | Banner above top bar |
| `packages/renderer/src/modals/TerminalOverlay.tsx` | xterm.js modal |
| `packages/renderer/src/modals/HookInstallModal.tsx` | Manual instructions modal |
| `packages/renderer/src/modals/ReconnectModal.tsx` | Reconnect modal |
| `packages/renderer/src/modals/settings/RuntimesPanel.tsx` | Manage runtimes panel |
| `packages/renderer/src/modals/settings/HookStatusPanel.tsx` | Hook status per runtime |
| `packages/renderer/src/modals/settings/EnvProbePanel.tsx` | Env probe panel |
| `packages/renderer/src/lib/xtermBridge.ts` | Pane WS ↔ xterm.js bridge |

### Modified renderer files

| Path | Change |
|---|---|
| `packages/renderer/src/shell/TopBar.tsx` | Render chip row + + button |
| `packages/renderer/src/modals/settings/SettingsModal.tsx` | Add new panels |
| `packages/renderer/src/state/store.ts` | Wire presence slice + new WS message types |

### New shared types

| Path | Responsibility |
|---|---|
| `packages/shared/src/managedAgents.ts` | Wire types for managed agent + terminal + presence |

### Skill bundle updates

| Path | Change |
|---|---|
| `packages/kernel/assets/claude-skill/f-mark/SKILL.md` | Mention managed spawn affordance |
| `packages/kernel/assets/codex-skill/f-mark/SKILL.md` | Same |
| `packages/kernel/assets/gemini-skill/f-mark/SKILL.md` | Same |
| `packages/kernel/assets/AGENT.md` | Note presence + ping endpoint |

### Tests

Tests live next to source via project convention (`packages/kernel/tests/<area>/<name>.test.ts`, `packages/renderer/tests/<area>/<name>.test.tsx`). Optional smoke at `packages/kernel/tests/smoke/tmux.smoke.test.ts`.

---

## Phase 1 — Regression tripwire & baseline

### Task 1.1: Capture green baseline

**Files:**
- Touch: none (verification only)

- [ ] **Step 1: Run full kernel test suite**

```bash
pnpm --filter @f-mark/kernel test
```

Expected: PASS. If not, STOP — the v0.3.0 codebase is already broken and must be fixed before any v0.4 work begins.

- [ ] **Step 2: Run renderer test suite**

```bash
pnpm --filter @f-mark/renderer test
```

Expected: PASS.

- [ ] **Step 3: Run typecheck across packages**

```bash
pnpm -r build
```

Expected: PASS.

- [ ] **Step 4: Record baseline**

Append to `docs/superpowers/plans/2026-05-23-tmux-agent-orchestration-v04.progress.md` (create if absent):

```markdown
# v0.4 Progress Log

## Phase 1 — Regression tripwire baseline (`<date>`)

- Kernel tests: ✓ pass
- Renderer tests: ✓ pass
- Build: ✓ pass

Commit: `<HEAD short hash>`
```

- [ ] **Step 5: Commit progress log**

```bash
git add docs/superpowers/plans/2026-05-23-tmux-agent-orchestration-v04.progress.md
git commit -m "chore(v0.4): record green baseline before tmux orchestration work"
```

---

## Phase 2 — Tmux Manager (no UI, no HTTP)

### Task 2.1: Path-hash + slug naming helpers

**Files:**
- Create: `packages/kernel/src/tmux/naming.ts`
- Test: `packages/kernel/tests/tmux/naming.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// packages/kernel/tests/tmux/naming.test.ts
import { describe, expect, it } from "vitest";
import {
  projectRootHash,
  fmarkAgentSessionName,
  fmarkTerminalSessionName,
  isFmarkSessionName,
  parseFmarkSessionName,
} from "../../src/tmux/naming.js";

describe("tmux naming", () => {
  const root = "/home/user/projects/acme-billing";

  it("projectRootHash returns 8 hex chars deterministically", () => {
    const a = projectRootHash(root);
    const b = projectRootHash(root);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{8}$/);
    expect(projectRootHash("/different")).not.toBe(a);
  });

  it("fmarkAgentSessionName composes the agent session id", () => {
    const name = fmarkAgentSessionName(root, "ag-claude-12");
    expect(name).toMatch(/^fmark-acme-billing-[0-9a-f]{8}-ag-ag-claude-12$/);
    expect(name.length).toBeLessThanOrEqual(90);
  });

  it("fmarkTerminalSessionName composes the terminal session id", () => {
    const name = fmarkTerminalSessionName(root, 3);
    expect(name).toMatch(/^fmark-acme-billing-[0-9a-f]{8}-term-3$/);
  });

  it("truncates long participant ids to 32 chars in the session name", () => {
    const longId = "ag-" + "x".repeat(64);
    const name = fmarkAgentSessionName(root, longId);
    // Anything after the path hash must be at most 32 chars from the id.
    expect(name).toContain("-ag-ag-");
    expect(name.length).toBeLessThanOrEqual(90);
  });

  it("isFmarkSessionName recognises the convention", () => {
    expect(isFmarkSessionName("fmark-acme-12345678-ag-ag-claude")).toBe(true);
    expect(isFmarkSessionName("random-session")).toBe(false);
  });

  it("parseFmarkSessionName extracts kind + id", () => {
    const a = parseFmarkSessionName("fmark-acme-12345678-ag-ag-claude");
    expect(a).toEqual({ kind: "agent", participantId: "ag-claude" });
    const t = parseFmarkSessionName("fmark-acme-12345678-term-2");
    expect(t).toEqual({ kind: "terminal", index: 2 });
    expect(parseFmarkSessionName("nope")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test (expect FAIL)**

```bash
pnpm --filter @f-mark/kernel test tests/tmux/naming.test.ts
```

Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Implement**

```typescript
// packages/kernel/src/tmux/naming.ts
import { createHash } from "node:crypto";
import { basename } from "node:path";

const MAX_NAME_LEN = 90;
const MAX_ID_IN_NAME = 32;

export function projectRootHash(root: string): string {
  return createHash("sha256").update(root).digest("hex").slice(0, 8);
}

function baseSlug(root: string): string {
  const slug = basename(root)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
  return slug.length > 0 ? slug : "fmark";
}

function truncId(id: string): string {
  return id.length <= MAX_ID_IN_NAME ? id : id.slice(0, MAX_ID_IN_NAME);
}

export function fmarkAgentSessionName(root: string, participantId: string): string {
  const name = `fmark-${baseSlug(root)}-${projectRootHash(root)}-ag-${truncId(participantId)}`;
  return name.length <= MAX_NAME_LEN ? name : name.slice(0, MAX_NAME_LEN);
}

export function fmarkTerminalSessionName(root: string, index: number): string {
  return `fmark-${baseSlug(root)}-${projectRootHash(root)}-term-${index}`;
}

const FMARK_RE = /^fmark-[a-z0-9-]+-[0-9a-f]{8}-(ag|term)-(.+)$/;

export function isFmarkSessionName(name: string): boolean {
  return FMARK_RE.test(name);
}

export type ParsedSession =
  | { kind: "agent"; participantId: string }
  | { kind: "terminal"; index: number };

export function parseFmarkSessionName(name: string): ParsedSession | null {
  const m = FMARK_RE.exec(name);
  if (!m) return null;
  const [, kind, rest] = m;
  if (kind === "ag") return { kind: "agent", participantId: rest! };
  const idx = Number.parseInt(rest!, 10);
  if (!Number.isFinite(idx)) return null;
  return { kind: "terminal", index: idx };
}
```

- [ ] **Step 4: Run test (expect PASS)**

```bash
pnpm --filter @f-mark/kernel test tests/tmux/naming.test.ts
```

Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/kernel/src/tmux/naming.ts packages/kernel/tests/tmux/naming.test.ts
git commit -m "feat(kernel/tmux): session naming with project-root hash"
```

### Task 2.2: Injectable command runner

**Files:**
- Create: `packages/kernel/src/tmux/commandRunner.ts`
- Test: `packages/kernel/tests/tmux/commandRunner.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// packages/kernel/tests/tmux/commandRunner.test.ts
import { describe, expect, it } from "vitest";
import { realCommandRunner, type CommandRunner, fakeCommandRunner } from "../../src/tmux/commandRunner.js";

describe("realCommandRunner", () => {
  const runner = realCommandRunner();

  it("runs a command and returns stdout", async () => {
    const r = await runner.run(["echo", "hello"]);
    expect(r.stdout.trim()).toBe("hello");
    expect(r.exitCode).toBe(0);
  });

  it("reports non-zero exit code without throwing", async () => {
    const r = await runner.run(["sh", "-c", "exit 7"]);
    expect(r.exitCode).toBe(7);
  });
});

describe("fakeCommandRunner", () => {
  it("returns programmed responses by command match", async () => {
    const fake = fakeCommandRunner();
    fake.expect(["tmux", "ls"], { stdout: "session-a\nsession-b\n", exitCode: 0 });
    const r = await fake.run(["tmux", "ls"]);
    expect(r.stdout).toBe("session-a\nsession-b\n");
  });

  it("records calls in order", async () => {
    const fake = fakeCommandRunner();
    fake.expect(["tmux", "new-session"], { stdout: "", exitCode: 0 });
    await fake.run(["tmux", "new-session", "-s", "x"]);
    expect(fake.calls).toEqual([["tmux", "new-session", "-s", "x"]]);
  });

  it("throws if an unexpected command is run", async () => {
    const fake = fakeCommandRunner();
    await expect(fake.run(["tmux", "kill-session"])).rejects.toThrow(/unexpected/);
  });
});
```

- [ ] **Step 2: Run (expect FAIL)**

```bash
pnpm --filter @f-mark/kernel test tests/tmux/commandRunner.test.ts
```

- [ ] **Step 3: Implement**

```typescript
// packages/kernel/src/tmux/commandRunner.ts
import { spawn } from "node:child_process";

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface CommandRunner {
  run(argv: string[], opts?: { cwd?: string; input?: string }): Promise<CommandResult>;
}

export function realCommandRunner(): CommandRunner {
  return {
    run(argv, opts = {}) {
      return new Promise<CommandResult>((resolve) => {
        const [cmd, ...args] = argv;
        if (!cmd) throw new Error("empty argv");
        const child = spawn(cmd, args, { cwd: opts.cwd, stdio: ["pipe", "pipe", "pipe"] });
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (d) => { stdout += d.toString(); });
        child.stderr.on("data", (d) => { stderr += d.toString(); });
        child.on("close", (code) => resolve({ stdout, stderr, exitCode: code ?? 0 }));
        if (opts.input !== undefined) {
          child.stdin.write(opts.input);
          child.stdin.end();
        } else {
          child.stdin.end();
        }
      });
    },
  };
}

export interface FakeCommandRunner extends CommandRunner {
  expect(prefix: string[], result: CommandResult): void;
  readonly calls: string[][];
}

export function fakeCommandRunner(): FakeCommandRunner {
  const queue: { prefix: string[]; result: CommandResult }[] = [];
  const calls: string[][] = [];
  return {
    expect(prefix, result) { queue.push({ prefix, result }); },
    get calls() { return calls; },
    async run(argv) {
      calls.push(argv);
      // First entry whose prefix matches the start of argv.
      const idx = queue.findIndex((q) =>
        q.prefix.every((p, i) => argv[i] === p),
      );
      if (idx === -1) throw new Error(`unexpected command: ${argv.join(" ")}`);
      const [match] = queue.splice(idx, 1);
      return match!.result;
    },
  };
}
```

- [ ] **Step 4: Run (expect PASS)**

```bash
pnpm --filter @f-mark/kernel test tests/tmux/commandRunner.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/kernel/src/tmux/commandRunner.ts packages/kernel/tests/tmux/commandRunner.test.ts
git commit -m "feat(kernel/tmux): injectable command runner for testability"
```

### Task 2.3: Tmux Manager primitives

**Files:**
- Create: `packages/kernel/src/tmux/manager.ts`
- Test: `packages/kernel/tests/tmux/manager.test.ts`

- [ ] **Step 1: Write failing tests covering spawnAgent, listFmark, killSession, captureSnapshot, setUserOption, getUserOption, sendLiteralText, sendKey**

```typescript
// packages/kernel/tests/tmux/manager.test.ts
import { describe, expect, it } from "vitest";
import { fakeCommandRunner } from "../../src/tmux/commandRunner.js";
import { createTmuxManager } from "../../src/tmux/manager.js";

const root = "/home/user/proj-acme";

describe("TmuxManager", () => {
  it("spawnAgent runs tmux new-session detached with executable+args and sets user options", async () => {
    const r = fakeCommandRunner();
    r.expect(["tmux", "new-session"], { stdout: "", stderr: "", exitCode: 0 });
    r.expect(["tmux", "set-option"], { stdout: "", stderr: "", exitCode: 0 });
    r.expect(["tmux", "set-option"], { stdout: "", stderr: "", exitCode: 0 });
    const mgr = createTmuxManager({ runner: r, projectRoot: root });
    const result = await mgr.spawnAgent({
      participantId: "ag-claude",
      executable: "claude",
      args: ["--model", "haiku"],
      env: { CLAUDE_TEST: "1" },
    });
    expect(result.sessionName).toMatch(/^fmark-proj-acme-[0-9a-f]{8}-ag-ag-claude$/);
    // First call must be new-session detached:
    const news = r.calls[0]!;
    expect(news).toContain("-d");
    expect(news).toContain("-s");
    expect(news.at(-3)).toBe("claude");
    expect(news.at(-2)).toBe("--model");
    expect(news.at(-1)).toBe("haiku");
  });

  it("spawnTerminal runs tmux new-session for $SHELL", async () => {
    const r = fakeCommandRunner();
    r.expect(["tmux", "new-session"], { stdout: "", stderr: "", exitCode: 0 });
    r.expect(["tmux", "set-option"], { stdout: "", stderr: "", exitCode: 0 });
    const mgr = createTmuxManager({ runner: r, projectRoot: root });
    const res = await mgr.spawnTerminal({ index: 2 });
    expect(res.sessionName).toMatch(/-term-2$/);
  });

  it("listFmarkSessions filters by prefix and verifies @fmark-project", async () => {
    const r = fakeCommandRunner();
    r.expect(["tmux", "ls"], {
      stdout: "fmark-proj-acme-abcdef12-ag-ag-claude\nother-session\nfmark-other-99999999-term-1\n",
      stderr: "",
      exitCode: 0,
    });
    r.expect(["tmux", "show-options"], { stdout: root + "\n", stderr: "", exitCode: 0 });
    r.expect(["tmux", "show-options"], { stdout: "/somewhere/else\n", stderr: "", exitCode: 0 });
    const mgr = createTmuxManager({ runner: r, projectRoot: root });
    const sessions = await mgr.listFmarkSessions();
    expect(sessions.map((s) => s.sessionName)).toEqual(["fmark-proj-acme-abcdef12-ag-ag-claude"]);
  });

  it("killSession runs tmux kill-session", async () => {
    const r = fakeCommandRunner();
    r.expect(["tmux", "kill-session"], { stdout: "", stderr: "", exitCode: 0 });
    const mgr = createTmuxManager({ runner: r, projectRoot: root });
    await mgr.killSession("fmark-x");
    expect(r.calls[0]).toEqual(["tmux", "kill-session", "-t", "fmark-x"]);
  });

  it("captureSnapshot runs tmux capture-pane with the correct flags", async () => {
    const r = fakeCommandRunner();
    r.expect(["tmux", "capture-pane"], { stdout: "snapshot-bytes", stderr: "", exitCode: 0 });
    const mgr = createTmuxManager({ runner: r, projectRoot: root });
    const out = await mgr.captureSnapshot("fmark-x");
    expect(out).toBe("snapshot-bytes");
    expect(r.calls[0]).toEqual(["tmux", "capture-pane", "-t", "fmark-x", "-p", "-e", "-J", "-S", "-2000"]);
  });

  it("sendLiteralText uses send-keys -l --", async () => {
    const r = fakeCommandRunner();
    r.expect(["tmux", "send-keys"], { stdout: "", stderr: "", exitCode: 0 });
    const mgr = createTmuxManager({ runner: r, projectRoot: root });
    await mgr.sendLiteralText("fmark-x", "hello world");
    expect(r.calls[0]).toEqual(["tmux", "send-keys", "-t", "fmark-x", "-l", "--", "hello world"]);
  });

  it("sendKey uses send-keys with key names", async () => {
    const r = fakeCommandRunner();
    r.expect(["tmux", "send-keys"], { stdout: "", stderr: "", exitCode: 0 });
    const mgr = createTmuxManager({ runner: r, projectRoot: root });
    await mgr.sendKey("fmark-x", "C-c");
    expect(r.calls[0]).toEqual(["tmux", "send-keys", "-t", "fmark-x", "--", "C-c"]);
  });

  it("paneAlive uses display-message + pane_dead", async () => {
    const r = fakeCommandRunner();
    r.expect(["tmux", "display-message"], { stdout: "0\n", stderr: "", exitCode: 0 });
    const mgr = createTmuxManager({ runner: r, projectRoot: root });
    expect(await mgr.paneAlive("fmark-x")).toBe(true);
  });

  it("getTmuxVersion parses output", async () => {
    const r = fakeCommandRunner();
    r.expect(["tmux", "-V"], { stdout: "tmux 3.4\n", stderr: "", exitCode: 0 });
    const mgr = createTmuxManager({ runner: r, projectRoot: root });
    expect(await mgr.getVersion()).toEqual({ major: 3, minor: 4, raw: "3.4" });
  });
});
```

- [ ] **Step 2: Run (expect FAIL)**

```bash
pnpm --filter @f-mark/kernel test tests/tmux/manager.test.ts
```

- [ ] **Step 3: Implement**

```typescript
// packages/kernel/src/tmux/manager.ts
import type { CommandRunner } from "./commandRunner.js";
import {
  fmarkAgentSessionName,
  fmarkTerminalSessionName,
  isFmarkSessionName,
  parseFmarkSessionName,
} from "./naming.js";

export interface TmuxManager {
  spawnAgent(input: {
    participantId: string;
    executable: string;
    args: string[];
    env?: Record<string, string>;
  }): Promise<{ sessionName: string }>;
  spawnTerminal(input: { index: number }): Promise<{ sessionName: string }>;
  listFmarkSessions(): Promise<ListedSession[]>;
  killSession(sessionName: string): Promise<void>;
  captureSnapshot(sessionName: string): Promise<string>;
  startPipePane(sessionName: string, fifo: string): Promise<void>;
  stopPipePane(sessionName: string): Promise<void>;
  sendLiteralText(sessionName: string, text: string): Promise<void>;
  sendKey(sessionName: string, key: string): Promise<void>;
  resize(sessionName: string, cols: number, rows: number): Promise<void>;
  paneAlive(sessionName: string): Promise<boolean>;
  getVersion(): Promise<{ major: number; minor: number; raw: string } | null>;
  getUserOption(sessionName: string, name: `@${string}`): Promise<string | null>;
}

export interface ListedSession {
  sessionName: string;
  kind: "agent" | "terminal";
  participantId?: string;
  index?: number;
}

export function createTmuxManager(deps: {
  runner: CommandRunner;
  projectRoot: string;
}): TmuxManager {
  const { runner, projectRoot } = deps;

  async function setUserOption(session: string, opt: `@${string}`, value: string): Promise<void> {
    await runner.run(["tmux", "set-option", "-t", session, opt, value]);
  }

  async function getUserOption(session: string, opt: `@${string}`): Promise<string | null> {
    const r = await runner.run(["tmux", "show-options", "-t", session, "-v", opt]);
    if (r.exitCode !== 0) return null;
    return r.stdout.trim() || null;
  }

  return {
    async spawnAgent({ participantId, executable, args, env }) {
      const sessionName = fmarkAgentSessionName(projectRoot, participantId);
      const envArgs: string[] = [];
      for (const [k, v] of Object.entries(env ?? {})) envArgs.push("-e", `${k}=${v}`);
      const argv = ["tmux", "new-session", "-d", "-s", sessionName, ...envArgs, "-c", projectRoot, executable, ...args];
      const r = await runner.run(argv);
      if (r.exitCode !== 0) throw new Error(`tmux new-session failed: ${r.stderr.trim()}`);
      await setUserOption(sessionName, "@fmark-project", projectRoot);
      await setUserOption(sessionName, "@fmark-participant", participantId);
      return { sessionName };
    },

    async spawnTerminal({ index }) {
      const sessionName = fmarkTerminalSessionName(projectRoot, index);
      const shell = process.env.SHELL ?? "/bin/sh";
      const r = await runner.run([
        "tmux", "new-session", "-d", "-s", sessionName, "-c", projectRoot, shell,
      ]);
      if (r.exitCode !== 0) throw new Error(`tmux new-session failed: ${r.stderr.trim()}`);
      await setUserOption(sessionName, "@fmark-project", projectRoot);
      return { sessionName };
    },

    async listFmarkSessions() {
      const r = await runner.run(["tmux", "ls", "-F", "#{session_name}"]);
      if (r.exitCode !== 0) return [];
      const candidates = r.stdout.split("\n").map((s) => s.trim()).filter(Boolean).filter(isFmarkSessionName);
      const verified: ListedSession[] = [];
      for (const name of candidates) {
        const val = await getUserOption(name, "@fmark-project");
        if (val !== projectRoot) continue;
        const parsed = parseFmarkSessionName(name);
        if (!parsed) continue;
        verified.push({ sessionName: name, ...parsed });
      }
      return verified;
    },

    async killSession(sessionName) {
      await runner.run(["tmux", "kill-session", "-t", sessionName]);
    },

    async captureSnapshot(sessionName) {
      const r = await runner.run(["tmux", "capture-pane", "-t", sessionName, "-p", "-e", "-J", "-S", "-2000"]);
      return r.stdout;
    },

    async startPipePane(sessionName, fifo) {
      // -O appends; -I would be input; default opens output pipe.
      await runner.run(["tmux", "pipe-pane", "-t", sessionName, "-o", `cat >> ${fifo}`]);
    },

    async stopPipePane(sessionName) {
      await runner.run(["tmux", "pipe-pane", "-t", sessionName]);
    },

    async sendLiteralText(sessionName, text) {
      await runner.run(["tmux", "send-keys", "-t", sessionName, "-l", "--", text]);
    },

    async sendKey(sessionName, key) {
      await runner.run(["tmux", "send-keys", "-t", sessionName, "--", key]);
    },

    async resize(sessionName, cols, rows) {
      await runner.run(["tmux", "resize-window", "-t", sessionName, "-x", String(cols), "-y", String(rows)]);
    },

    async paneAlive(sessionName) {
      const r = await runner.run(["tmux", "display-message", "-t", sessionName, "-p", "#{pane_dead}"]);
      if (r.exitCode !== 0) return false;
      return r.stdout.trim() === "0";
    },

    async getVersion() {
      const r = await runner.run(["tmux", "-V"]);
      if (r.exitCode !== 0) return null;
      const m = /^tmux\s+(\d+)\.(\d+)/.exec(r.stdout.trim());
      if (!m) return null;
      return { major: Number(m[1]), minor: Number(m[2]), raw: `${m[1]}.${m[2]}` };
    },

    async getUserOption(sessionName, name) { return getUserOption(sessionName, name); },
  };
}
```

- [ ] **Step 4: Run (expect PASS)**

```bash
pnpm --filter @f-mark/kernel test tests/tmux/manager.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/kernel/src/tmux/manager.ts packages/kernel/tests/tmux/manager.test.ts
git commit -m "feat(kernel/tmux): manager primitives (spawn/list/kill/capture/pipe/send-keys/version)"
```

### Task 2.4: Per-pane input queue

**Files:**
- Create: `packages/kernel/src/tmux/inputQueue.ts`
- Test: `packages/kernel/tests/tmux/inputQueue.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// packages/kernel/tests/tmux/inputQueue.test.ts
import { describe, expect, it } from "vitest";
import { createInputQueue } from "../../src/tmux/inputQueue.js";

describe("createInputQueue", () => {
  it("serializes operations per pane", async () => {
    const order: string[] = [];
    const q = createInputQueue();
    const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
    const a = q.enqueue("pane-1", async () => { await delay(20); order.push("a"); });
    const b = q.enqueue("pane-1", async () => { order.push("b"); });
    const c = q.enqueue("pane-1", async () => { order.push("c"); });
    await Promise.all([a, b, c]);
    expect(order).toEqual(["a", "b", "c"]);
  });

  it("does not serialize across panes", async () => {
    const events: string[] = [];
    const q = createInputQueue();
    const a = q.enqueue("p1", async () => { events.push("p1-start"); await new Promise((r) => setTimeout(r, 30)); events.push("p1-end"); });
    const b = q.enqueue("p2", async () => { events.push("p2"); });
    await Promise.all([a, b]);
    expect(events).toEqual(["p1-start", "p2", "p1-end"]);
  });

  it("propagates rejections", async () => {
    const q = createInputQueue();
    await expect(q.enqueue("p", async () => { throw new Error("boom"); })).rejects.toThrow(/boom/);
  });
});
```

- [ ] **Step 2: Run (expect FAIL)**

- [ ] **Step 3: Implement**

```typescript
// packages/kernel/src/tmux/inputQueue.ts
export interface InputQueue {
  enqueue<T>(paneKey: string, task: () => Promise<T>): Promise<T>;
}

export function createInputQueue(): InputQueue {
  const tails = new Map<string, Promise<unknown>>();
  return {
    enqueue<T>(paneKey: string, task: () => Promise<T>): Promise<T> {
      const prev = tails.get(paneKey) ?? Promise.resolve();
      const next = prev.then(() => task(), () => task());
      tails.set(paneKey, next.catch(() => undefined));
      return next as Promise<T>;
    },
  };
}
```

- [ ] **Step 4: Run (expect PASS)**

- [ ] **Step 5: Commit**

```bash
git add packages/kernel/src/tmux/inputQueue.ts packages/kernel/tests/tmux/inputQueue.test.ts
git commit -m "feat(kernel/tmux): per-pane FIFO input queue"
```

### Phase 2 — Buddy verification

- [ ] **Step P2-V: Run `/buddy` to verify Phase 2**

Use the `buddy` skill with this brief:

> Verify Phase 2 of the tmux orchestration v0.4 plan. Read `docs/superpowers/plans/2026-05-23-tmux-agent-orchestration-v04.md` Phase 2 tasks 2.1–2.4 and the resulting source/tests. Run `pnpm --filter @f-mark/kernel test tests/tmux/` and confirm every test actually runs + asserts (not just exits 0 with zero assertions). Spot-check the manager's argv shapes match the test expectations and confirm the fake command runner is not silently swallowing failures. Write findings to `planning/buddy-reviews/2026-05-23-tmux-orchestration-phase-2.md`. Severity-tag any issues. Don't approve if the tests don't actually exercise the code.

After buddy review:
- If findings exist → address them → re-run tests → commit fixes.
- If approved → record in progress log and continue.

---

## Phase 3 — Runtime Registry

### Task 3.1: Built-in defaults + validation

**Files:**
- Create: `packages/kernel/src/runtimes/defaults.ts`
- Create: `packages/kernel/src/runtimes/validation.ts`
- Test: `packages/kernel/tests/runtimes/validation.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// packages/kernel/tests/runtimes/validation.test.ts
import { describe, expect, it } from "vitest";
import {
  validateExecutable,
  validateArgs,
  validateSlashCommand,
  validateMessageText,
  validateRuntimeEntry,
} from "../../src/runtimes/validation.js";

describe("validation", () => {
  it("accepts safe executables", () => {
    expect(() => validateExecutable("claude")).not.toThrow();
    expect(() => validateExecutable("/usr/local/bin/claude")).not.toThrow();
    expect(() => validateExecutable("./scripts/run-claude")).not.toThrow();
  });

  it("rejects shell metacharacters in executables", () => {
    for (const bad of ["claude && rm -rf /", "claude;ls", "claude|cat", "claude `id`", "claude\nls", "claude $(ls)", "claude with space"]) {
      expect(() => validateExecutable(bad)).toThrow(/invalid executable/);
    }
  });

  it("accepts args as a string array", () => {
    expect(() => validateArgs(["--model", "haiku"])).not.toThrow();
  });

  it("rejects non-string args", () => {
    expect(() => validateArgs(["--model", 123 as unknown as string])).toThrow();
  });

  it("validateSlashCommand accepts alphanumeric ≤32", () => {
    expect(() => validateSlashCommand("compact")).not.toThrow();
    expect(() => validateSlashCommand("custom-name_1")).not.toThrow();
    expect(() => validateSlashCommand("1bad")).toThrow();
    expect(() => validateSlashCommand("has space")).toThrow();
    expect(() => validateSlashCommand("a".repeat(33))).toThrow();
  });

  it("validateMessageText rejects control chars except \\t", () => {
    expect(() => validateMessageText("hello\tworld")).not.toThrow();
    expect(() => validateMessageText("hello\nworld")).toThrow(/control char/);
    expect(() => validateMessageText("\x00")).toThrow();
  });

  it("validateRuntimeEntry catches missing fields", () => {
    expect(() => validateRuntimeEntry({ displayName: "X", executable: "x", args: [] })).not.toThrow();
    expect(() => validateRuntimeEntry({ executable: "x", args: [] } as unknown as Record<string, unknown>)).toThrow();
    expect(() => validateRuntimeEntry({ displayName: "X", executable: "bad name", args: [] })).toThrow();
  });
});
```

- [ ] **Step 2: Run (expect FAIL)**

- [ ] **Step 3: Implement**

```typescript
// packages/kernel/src/runtimes/validation.ts
const EXECUTABLE_RE = /^[a-zA-Z0-9_./-]+$/;
const SLASH_RE = /^[a-zA-Z][a-zA-Z0-9_-]{0,32}$/;

export function validateExecutable(value: string): void {
  if (typeof value !== "string" || value.length === 0) throw new Error("invalid executable: empty");
  if (!EXECUTABLE_RE.test(value)) throw new Error(`invalid executable: ${value}`);
}

export function validateArgs(args: unknown): asserts args is string[] {
  if (!Array.isArray(args)) throw new Error("args must be an array");
  for (const a of args) {
    if (typeof a !== "string") throw new Error("args must be strings");
  }
}

export function validateSlashCommand(value: string): void {
  if (!SLASH_RE.test(value)) throw new Error(`invalid slash command: ${value}`);
}

export function validateMessageText(text: string): void {
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < 0x20 && c !== 0x09) throw new Error(`message contains control char at index ${i}`);
  }
}

export interface RuntimeEntryShape {
  displayName: string;
  executable: string;
  args: string[];
  env?: Record<string, string>;
  icon?: string;
  readyDelayMs?: number;
}

export function validateRuntimeEntry(entry: unknown): asserts entry is RuntimeEntryShape {
  if (!entry || typeof entry !== "object") throw new Error("runtime entry must be an object");
  const e = entry as Partial<RuntimeEntryShape>;
  if (typeof e.displayName !== "string" || e.displayName.length === 0) throw new Error("displayName required");
  validateExecutable(e.executable as string);
  validateArgs(e.args);
  if (e.env !== undefined) {
    if (typeof e.env !== "object" || e.env === null) throw new Error("env must be an object");
    for (const [k, v] of Object.entries(e.env)) {
      if (typeof v !== "string") throw new Error(`env.${k} must be a string`);
    }
  }
  if (e.icon !== undefined && typeof e.icon !== "string") throw new Error("icon must be a string");
  if (e.readyDelayMs !== undefined && typeof e.readyDelayMs !== "number") throw new Error("readyDelayMs must be a number");
}
```

```typescript
// packages/kernel/src/runtimes/defaults.ts
import type { RuntimeEntryShape } from "./validation.js";

export const DEFAULT_RUNTIMES: Record<string, RuntimeEntryShape> = {
  claude: { displayName: "Claude Code", executable: "claude", args: [], icon: "claude", readyDelayMs: 2000 },
  codex:  { displayName: "Codex",       executable: "codex",  args: [], icon: "codex",  readyDelayMs: 1500 },
  gemini: { displayName: "Gemini",      executable: "gemini", args: [], icon: "gemini", readyDelayMs: 1500 },
};
```

- [ ] **Step 4: Run (expect PASS)**

- [ ] **Step 5: Commit**

```bash
git add packages/kernel/src/runtimes/validation.ts packages/kernel/src/runtimes/defaults.ts packages/kernel/tests/runtimes/validation.test.ts
git commit -m "feat(kernel/runtimes): defaults + validation"
```

### Task 3.2: Registry CRUD with `.f-mark/runtimes.json`

**Files:**
- Create: `packages/kernel/src/runtimes/registry.ts`
- Test: `packages/kernel/tests/runtimes/registry.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// packages/kernel/tests/runtimes/registry.test.ts
import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  loadRuntimes,
  saveRuntimes,
  initRuntimesFile,
  upsertRuntime,
  removeRuntime,
} from "../../src/runtimes/registry.js";
import { DEFAULT_RUNTIMES } from "../../src/runtimes/defaults.js";

async function withTmpFmark<T>(fn: (fmarkDir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "fmark-rt-"));
  try { return await fn(dir); } finally { await rm(dir, { recursive: true, force: true }); }
}

describe("runtimes registry", () => {
  it("initRuntimesFile writes defaults if absent", async () => {
    await withTmpFmark(async (fmarkDir) => {
      await initRuntimesFile(fmarkDir);
      const parsed = JSON.parse(await readFile(join(fmarkDir, "runtimes.json"), "utf8"));
      expect(parsed.runtimes.claude).toEqual(DEFAULT_RUNTIMES.claude);
    });
  });

  it("initRuntimesFile is idempotent and preserves user edits", async () => {
    await withTmpFmark(async (fmarkDir) => {
      await initRuntimesFile(fmarkDir);
      const cfg = await loadRuntimes(fmarkDir);
      cfg.runtimes.claude!.args = ["--model", "haiku"];
      await saveRuntimes(fmarkDir, cfg);
      await initRuntimesFile(fmarkDir); // second call must NOT overwrite
      const after = await loadRuntimes(fmarkDir);
      expect(after.runtimes.claude!.args).toEqual(["--model", "haiku"]);
    });
  });

  it("upsertRuntime adds and updates", async () => {
    await withTmpFmark(async (fmarkDir) => {
      await initRuntimesFile(fmarkDir);
      await upsertRuntime(fmarkDir, "mylocal", { displayName: "My Local", executable: "/usr/local/bin/my", args: ["--debug"] });
      const cfg = await loadRuntimes(fmarkDir);
      expect(cfg.runtimes.mylocal?.displayName).toBe("My Local");
    });
  });

  it("removeRuntime deletes", async () => {
    await withTmpFmark(async (fmarkDir) => {
      await initRuntimesFile(fmarkDir);
      await upsertRuntime(fmarkDir, "x", { displayName: "X", executable: "x", args: [] });
      await removeRuntime(fmarkDir, "x");
      const cfg = await loadRuntimes(fmarkDir);
      expect(cfg.runtimes.x).toBeUndefined();
    });
  });

  it("upsertRuntime rejects bad executable", async () => {
    await withTmpFmark(async (fmarkDir) => {
      await initRuntimesFile(fmarkDir);
      await expect(upsertRuntime(fmarkDir, "bad", { displayName: "Bad", executable: "bad ; rm -rf", args: [] })).rejects.toThrow();
    });
  });
});
```

- [ ] **Step 2: Run (expect FAIL)**

- [ ] **Step 3: Implement**

```typescript
// packages/kernel/src/runtimes/registry.ts
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DEFAULT_RUNTIMES } from "./defaults.js";
import { validateRuntimeEntry, type RuntimeEntryShape } from "./validation.js";

const FILE = "runtimes.json";
const VERSION = "1.0";

export interface RuntimesFile {
  version: string;
  runtimes: Record<string, RuntimeEntryShape>;
}

function filePath(fmarkDir: string): string { return join(fmarkDir, FILE); }

async function exists(p: string): Promise<boolean> {
  try { await stat(p); return true; } catch { return false; }
}

export async function loadRuntimes(fmarkDir: string): Promise<RuntimesFile> {
  const txt = await readFile(filePath(fmarkDir), "utf8");
  const parsed = JSON.parse(txt) as RuntimesFile;
  for (const [, entry] of Object.entries(parsed.runtimes ?? {})) validateRuntimeEntry(entry);
  return parsed;
}

export async function saveRuntimes(fmarkDir: string, cfg: RuntimesFile): Promise<void> {
  await mkdir(fmarkDir, { recursive: true });
  for (const [, entry] of Object.entries(cfg.runtimes)) validateRuntimeEntry(entry);
  await writeFile(filePath(fmarkDir), JSON.stringify(cfg, null, 2), "utf8");
}

export async function initRuntimesFile(fmarkDir: string): Promise<void> {
  await mkdir(fmarkDir, { recursive: true });
  if (await exists(filePath(fmarkDir))) return;
  await saveRuntimes(fmarkDir, { version: VERSION, runtimes: { ...DEFAULT_RUNTIMES } });
}

export async function upsertRuntime(
  fmarkDir: string,
  id: string,
  entry: RuntimeEntryShape,
): Promise<void> {
  validateRuntimeEntry(entry);
  const cfg = await loadRuntimes(fmarkDir);
  cfg.runtimes[id] = entry;
  await saveRuntimes(fmarkDir, cfg);
}

export async function removeRuntime(fmarkDir: string, id: string): Promise<void> {
  const cfg = await loadRuntimes(fmarkDir);
  delete cfg.runtimes[id];
  await saveRuntimes(fmarkDir, cfg);
}
```

- [ ] **Step 4: Run (expect PASS)**

- [ ] **Step 5: Commit**

```bash
git add packages/kernel/src/runtimes/registry.ts packages/kernel/tests/runtimes/registry.test.ts
git commit -m "feat(kernel/runtimes): registry CRUD with .f-mark/runtimes.json"
```

### Task 3.3: Wire `initProject` to write defaults

**Files:**
- Modify: `packages/kernel/src/project.ts` (add `initRuntimesFile` call)
- Test: `packages/kernel/tests/project.test.ts` (add assertion)

- [ ] **Step 1: Read existing test file**

Read `packages/kernel/tests/project.test.ts`. Identify where existing `initProject` test asserts file contents.

- [ ] **Step 2: Add failing assertion**

In the existing initProject test block, add:

```typescript
import { readFile } from "node:fs/promises";
// ... at the end of the existing initProject success test ...
const runtimes = JSON.parse(await readFile(join(p.fmarkDir(), "runtimes.json"), "utf8"));
expect(runtimes.runtimes.claude).toBeDefined();
expect(runtimes.runtimes.codex).toBeDefined();
expect(runtimes.runtimes.gemini).toBeDefined();
```

- [ ] **Step 3: Run (expect FAIL)**

```bash
pnpm --filter @f-mark/kernel test tests/project.test.ts
```

- [ ] **Step 4: Implement**

Modify `packages/kernel/src/project.ts`:

```typescript
// at top of file
import { initRuntimesFile } from "./runtimes/registry.js";
// ... in initProject(), after existing AGENT.md write ...
await initRuntimesFile(p.fmarkDir());
```

- [ ] **Step 5: Run (expect PASS)**

- [ ] **Step 6: Commit**

```bash
git add packages/kernel/src/project.ts packages/kernel/tests/project.test.ts
git commit -m "feat(kernel/project): initProject seeds runtimes.json with defaults"
```

### Phase 3 — Buddy verification

- [ ] **Step P3-V: `/buddy` verifies registry + initProject integration**

Brief: "Verify Phase 3. Confirm `pnpm --filter @f-mark/kernel test tests/runtimes/` and `tests/project.test.ts` pass with non-trivial assertions, the validation rejects shell metacharacters as designed, `initRuntimesFile` is truly idempotent (does not clobber user edits), and the V0.3.0 regression baseline (`pnpm --filter @f-mark/kernel test`) is unaffected. Write `planning/buddy-reviews/2026-05-23-tmux-orchestration-phase-3.md`."

---

## Phase 4 — Presence Tracker + `POST /agents/:id/ping`

### Task 4.1: Presence state machine

**Files:**
- Create: `packages/kernel/src/presence/tracker.ts`
- Test: `packages/kernel/tests/presence/tracker.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// packages/kernel/tests/presence/tracker.test.ts
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createPresenceTracker } from "../../src/presence/tracker.js";

describe("PresenceTracker", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("ping sets online and broadcasts state change", () => {
    const broadcasts: unknown[] = [];
    const t = createPresenceTracker({ broadcast: (m) => broadcasts.push(m) });
    t.ping("ag-claude");
    const s = t.snapshot().get("ag-claude");
    expect(s?.state).toBe("online");
    expect(broadcasts).toHaveLength(1);
  });

  it("idempotent broadcasts: same state does not re-emit", () => {
    const broadcasts: unknown[] = [];
    const t = createPresenceTracker({ broadcast: (m) => broadcasts.push(m) });
    t.ping("ag-claude");
    t.ping("ag-claude");
    expect(broadcasts).toHaveLength(1);
  });

  it("transitions to stale after 60s without ping", () => {
    const broadcasts: any[] = [];
    const t = createPresenceTracker({ broadcast: (m) => broadcasts.push(m) });
    t.ping("ag-claude");
    vi.advanceTimersByTime(61_000);
    t.tick(); // user/server tick
    expect(t.snapshot().get("ag-claude")?.state).toBe("stale");
    expect(broadcasts.at(-1).state).toBe("stale");
  });

  it("stretched threshold for managed-with-pane-alive: stays online up to 120s", () => {
    const broadcasts: any[] = [];
    const t = createPresenceTracker({ broadcast: (m) => broadcasts.push(m) });
    t.setManagedPane("ag-claude", { paneAlive: () => true });
    t.ping("ag-claude");
    vi.advanceTimersByTime(90_000);
    t.tick();
    expect(t.snapshot().get("ag-claude")?.state).toBe("online");
    vi.advanceTimersByTime(40_000);
    t.tick();
    expect(t.snapshot().get("ag-claude")?.state).toBe("stale");
  });

  it("transitions to offline after 10m", () => {
    const t = createPresenceTracker({ broadcast: () => {} });
    t.ping("ag-x");
    vi.advanceTimersByTime(601_000);
    t.tick();
    expect(t.snapshot().get("ag-x")?.state).toBe("offline");
  });

  it("pane-dead state when managed pane stops being alive", () => {
    const t = createPresenceTracker({ broadcast: () => {} });
    let alive = true;
    t.setManagedPane("ag-x", { paneAlive: () => alive });
    t.ping("ag-x");
    alive = false;
    t.tick();
    expect(t.snapshot().get("ag-x")?.state).toBe("pane-dead");
  });

  it("setManagedHookStatus(false) at spawn yields hook-not-installed even with no pings", () => {
    const t = createPresenceTracker({ broadcast: () => {} });
    t.setManagedHookStatus("ag-x", false);
    expect(t.snapshot().get("ag-x")?.state).toBe("hook-not-installed");
    // First ping → online (proves the user installed hooks)
    t.ping("ag-x");
    expect(t.snapshot().get("ag-x")?.state).toBe("online");
  });
});
```

- [ ] **Step 2: Run (expect FAIL)**

- [ ] **Step 3: Implement**

```typescript
// packages/kernel/src/presence/tracker.ts
export type PresenceState =
  | "launching"
  | "online"
  | "stale"
  | "offline"
  | "pane-dead"
  | "hook-not-installed";

export interface PresenceEntry {
  state: PresenceState;
  lastHookAt: number | null;
  paneAlive?: () => boolean;
  hooksInstalled?: boolean;
}

export interface PresenceTracker {
  ping(participantId: string): void;
  setManagedPane(participantId: string, opts: { paneAlive: () => boolean }): void;
  clearManagedPane(participantId: string): void;
  setManagedHookStatus(participantId: string, installed: boolean): void;
  tick(): void;
  snapshot(): Map<string, { state: PresenceState; lastHookAt: number | null }>;
  remove(participantId: string): void;
}

const ONLINE_TTL_MS = 60_000;
const ONLINE_MANAGED_TTL_MS = 120_000;
const OFFLINE_TTL_MS = 600_000;

export interface CreateTrackerDeps {
  broadcast(msg: { type: "presence"; participant_id: string; state: PresenceState; last_hook_at: number | null }): void;
  now?: () => number;
}

export function createPresenceTracker(deps: CreateTrackerDeps): PresenceTracker {
  const now = deps.now ?? (() => Date.now());
  const map = new Map<string, PresenceEntry>();

  function deriveState(id: string, e: PresenceEntry): PresenceState {
    if (e.paneAlive && !e.paneAlive()) return "pane-dead";
    if (e.hooksInstalled === false && e.lastHookAt === null) return "hook-not-installed";
    if (e.lastHookAt === null) return "launching";
    const age = now() - e.lastHookAt;
    const onlineCap = e.paneAlive ? ONLINE_MANAGED_TTL_MS : ONLINE_TTL_MS;
    if (age <= onlineCap) return "online";
    if (age <= OFFLINE_TTL_MS) return "stale";
    return "offline";
  }

  function emit(id: string, e: PresenceEntry, prev: PresenceState | undefined): void {
    if (prev === e.state) return;
    deps.broadcast({ type: "presence", participant_id: id, state: e.state, last_hook_at: e.lastHookAt });
  }

  return {
    ping(id) {
      const cur = map.get(id) ?? { state: "launching", lastHookAt: null };
      const prev = cur.state;
      cur.lastHookAt = now();
      cur.state = deriveState(id, cur);
      map.set(id, cur);
      emit(id, cur, prev);
    },
    setManagedPane(id, { paneAlive }) {
      const cur = map.get(id) ?? { state: "launching", lastHookAt: null };
      const prev = cur.state;
      cur.paneAlive = paneAlive;
      cur.state = deriveState(id, cur);
      map.set(id, cur);
      emit(id, cur, prev);
    },
    clearManagedPane(id) {
      const cur = map.get(id);
      if (!cur) return;
      const prev = cur.state;
      delete cur.paneAlive;
      cur.state = deriveState(id, cur);
      emit(id, cur, prev);
    },
    setManagedHookStatus(id, installed) {
      const cur = map.get(id) ?? { state: "launching", lastHookAt: null };
      const prev = cur.state;
      cur.hooksInstalled = installed;
      cur.state = deriveState(id, cur);
      map.set(id, cur);
      emit(id, cur, prev);
    },
    tick() {
      for (const [id, e] of map.entries()) {
        const prev = e.state;
        e.state = deriveState(id, e);
        emit(id, e, prev);
      }
    },
    snapshot() {
      const out = new Map<string, { state: PresenceState; lastHookAt: number | null }>();
      for (const [id, e] of map.entries()) out.set(id, { state: e.state, lastHookAt: e.lastHookAt });
      return out;
    },
    remove(id) { map.delete(id); },
  };
}
```

- [ ] **Step 4: Run (expect PASS)**

- [ ] **Step 5: Commit**

```bash
git add packages/kernel/src/presence/tracker.ts packages/kernel/tests/presence/tracker.test.ts
git commit -m "feat(kernel/presence): in-memory state machine with TTL + pane liveness"
```

### Task 4.2: `POST /agents/:id/ping` route

**Files:**
- Create: `packages/kernel/src/routes/presence.ts`
- Test: `packages/kernel/tests/routes/presence.test.ts`
- Modify: `packages/kernel/src/server.ts` (register route + share tracker)

- [ ] **Step 1: Write failing route test**

```typescript
// packages/kernel/tests/routes/presence.test.ts
import { describe, expect, it } from "vitest";
import Fastify from "fastify";
import { registerPresenceRoutes } from "../../src/routes/presence.js";
import { createPresenceTracker } from "../../src/presence/tracker.js";

describe("POST /agents/:id/ping", () => {
  it("204s and bumps the tracker", async () => {
    const broadcasts: unknown[] = [];
    const tracker = createPresenceTracker({ broadcast: (m) => broadcasts.push(m) });
    const app = Fastify();
    registerPresenceRoutes(app, () => tracker);
    const res = await app.inject({ method: "POST", url: "/agents/ag-claude/ping", payload: {} });
    expect(res.statusCode).toBe(204);
    expect(tracker.snapshot().get("ag-claude")?.state).toBe("online");
    await app.close();
  });

  it("400 on invalid participant id", async () => {
    const app = Fastify();
    registerPresenceRoutes(app, () => createPresenceTracker({ broadcast: () => {} }));
    const res = await app.inject({ method: "POST", url: "/agents/BAD_ID/ping", payload: {} });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});
```

- [ ] **Step 2: Run (expect FAIL)**

- [ ] **Step 3: Implement**

```typescript
// packages/kernel/src/routes/presence.ts
import type { FastifyInstance } from "fastify";
import { isValidParticipantId } from "../participants.js";
import type { PresenceTracker } from "../presence/tracker.js";

export function registerPresenceRoutes(
  app: FastifyInstance,
  getTracker: () => PresenceTracker,
): void {
  app.post<{ Params: { id: string } }>("/agents/:id/ping", async (req, reply) => {
    const id = decodeURIComponent(req.params.id);
    if (!isValidParticipantId(id)) {
      reply.code(400);
      return { error: "invalid participant_id" };
    }
    getTracker().ping(id);
    reply.code(204);
    return null;
  });
}
```

- [ ] **Step 4: Wire into server.ts**

Modify `packages/kernel/src/server.ts`:

```typescript
// add import
import { registerPresenceRoutes } from "./routes/presence.js";
import { createPresenceTracker } from "./presence/tracker.js";
// inside createServer, after busRef setup:
const tracker = createPresenceTracker({
  broadcast: (m) => busRef.publish(m as unknown as BusMessage),
});
const ticker = setInterval(() => tracker.tick(), 5_000);
ticker.unref();
// add registration call alongside other route registrations:
registerPresenceRoutes(app, () => tracker);
// extend the return value:
return { app, getBus: () => busRef, getTracker: () => tracker };
```

(Update `CreatedServer` interface accordingly. Also extend `BusMessage` type in `ws/bus.ts` to include the presence message; see Task 4.3 below.)

- [ ] **Step 5: Run (expect PASS)**

- [ ] **Step 6: Commit**

```bash
git add packages/kernel/src/routes/presence.ts packages/kernel/tests/routes/presence.test.ts packages/kernel/src/server.ts
git commit -m "feat(kernel/presence): POST /agents/:id/ping endpoint + server wiring"
```

### Task 4.3: Extend WS bus types for presence messages

**Files:**
- Modify: `packages/kernel/src/ws/bus.ts`
- Update: `packages/kernel/tests/ws.test.ts` (add presence message test)

- [ ] **Step 1: Add failing test**

Append to existing `packages/kernel/tests/ws.test.ts`:

```typescript
it("broadcasts presence messages", async () => {
  // ... using existing test harness pattern ...
  // publish a presence message and assert it arrives.
});
```

(Reuse existing test setup — read the file first to match its style.)

- [ ] **Step 2: Run (expect FAIL)**

- [ ] **Step 3: Implement**

Modify `packages/kernel/src/ws/bus.ts` to broaden `BusMessage`:

```typescript
export interface PresenceMessage {
  type: "presence";
  participant_id: string;
  state: string;
  last_hook_at: number | null;
}

export interface ManagedAgentSpawnedMessage {
  type: "managed-agent.spawned";
  participant_id: string;
  tmux_session: string;
  runtime_id: string;
}

export interface ManagedAgentKilledMessage {
  type: "managed-agent.killed";
  participant_id: string;
}

export interface ManagedAgentTerminalSpawnedMessage {
  type: "managed-agent.terminal-spawned";
  tmux_session: string;
  label: string;
}

export interface EnvProbeUpdatedMessage {
  type: "env-probe.updated";
  result: unknown;
}

export type BusMessage =
  | EventAddedMessage
  | EventSupersededMessage
  | PresenceMessage
  | ManagedAgentSpawnedMessage
  | ManagedAgentKilledMessage
  | ManagedAgentTerminalSpawnedMessage
  | EnvProbeUpdatedMessage;
```

- [ ] **Step 4: Run (expect PASS)**

- [ ] **Step 5: Commit**

```bash
git add packages/kernel/src/ws/bus.ts packages/kernel/tests/ws.test.ts
git commit -m "feat(kernel/ws): extend bus message types for presence + managed-agent + env-probe"
```

### Phase 4 — Buddy verification

- [ ] **Step P4-V: `/buddy` verification**

Brief: "Verify Phase 4. Confirm presence state machine tests cover all six states (launching, online, stale, offline, pane-dead, hook-not-installed) and transitions between them. Confirm the route test actually inspects the tracker mutation (not just status code). Confirm server.ts wiring doesn't leak intervals or break v0.3.0 regression baseline. `pnpm --filter @f-mark/kernel test` must be green. Write `planning/buddy-reviews/2026-05-23-tmux-orchestration-phase-4.md`."

---

## Phase 5 — Wire shipped auto-stream to call ping

### Task 5.1: Modify autoStream to POST ping

**Files:**
- Modify: `packages/kernel/src/hooks/autoStream.ts`
- Modify: `packages/kernel/src/hooks/post.ts` (add a `postPing` helper)
- Test: `packages/kernel/tests/hooks/ping.test.ts` (new)

- [ ] **Step 1: Add failing test**

```typescript
// packages/kernel/tests/hooks/ping.test.ts
import { describe, expect, it, vi } from "vitest";
import { postPing } from "../../src/hooks/post.js";

describe("postPing", () => {
  it("POSTs to /agents/:id/ping with bearer token", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      calls.push({ url: url.toString(), init: init ?? {} });
      return new Response(null, { status: 204 });
    });
    await postPing({ kernelUrl: "http://localhost:7777", token: "tok", fmarkDir: "/x" }, "ag-claude");
    expect(calls[0]?.url).toBe("http://localhost:7777/agents/ag-claude/ping");
    expect((calls[0]?.init.headers as Record<string,string>).Authorization).toBe("Bearer tok");
    fetchSpy.mockRestore();
  });

  it("swallows network errors silently (best-effort)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network"));
    await expect(postPing({ kernelUrl: "http://x", token: "t", fmarkDir: "/x" }, "ag")).resolves.toBeUndefined();
    fetchSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run (expect FAIL)**

- [ ] **Step 3: Implement `postPing`**

Add to `packages/kernel/src/hooks/post.ts`:

```typescript
export async function postPing(ctx: HookContext, participantId: string): Promise<void> {
  try {
    await fetch(`${ctx.kernelUrl}/agents/${participantId}/ping`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ctx.token}` },
      body: "{}",
    });
  } catch {
    // ping is best-effort; never fail the hook for presence
  }
}
```

- [ ] **Step 4: Call from autoStream at the start of every fire**

Modify `packages/kernel/src/hooks/autoStream.ts`:

```typescript
// after loading ctx + sessionId, before any other POSTs:
import { postPing } from "./post.js";
// ...
await postPing(ctx, participantId);
```

- [ ] **Step 5: Run (expect PASS)**

```bash
pnpm --filter @f-mark/kernel test tests/hooks/
```

- [ ] **Step 6: Run full kernel suite to confirm v0.3.0 regression OK**

```bash
pnpm --filter @f-mark/kernel test
```

- [ ] **Step 7: Commit**

```bash
git add packages/kernel/src/hooks/autoStream.ts packages/kernel/src/hooks/post.ts packages/kernel/tests/hooks/ping.test.ts
git commit -m "feat(kernel/hooks): autoStream pings presence tracker on every fire"
```

### Phase 5 — Buddy verification

Brief: "Verify Phase 5: confirm autoStream now posts to /agents/:id/ping before any other POST, confirm ping failures don't break the rest of the autoStream flow, confirm v0.3.0 regression tests are still green. Write `planning/buddy-reviews/2026-05-23-tmux-orchestration-phase-5.md`."

---

## Phase 6 — Managed-agent state + routes

### Task 6.1: `agents/managed.ts` sibling-file helpers

**Files:**
- Create: `packages/kernel/src/agents/managed.ts`
- Test: `packages/kernel/tests/agents/managed.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// packages/kernel/tests/agents/managed.test.ts
import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  writeTmuxSession,
  readTmuxSession,
  writeRuntime,
  readRuntime,
  clearManagedSiblings,
  listManagedAgentIds,
} from "../../src/agents/managed.js";

async function withTmpFmark<T>(fn: (fmarkDir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "fmark-mgd-"));
  try { return await fn(dir); } finally { await rm(dir, { recursive: true, force: true }); }
}

describe("managed sibling files", () => {
  it("round-trips tmux-session and runtime", async () => {
    await withTmpFmark(async (fmarkDir) => {
      await writeTmuxSession(fmarkDir, "ag-claude", "fmark-x-ag-ag-claude");
      await writeRuntime(fmarkDir, "ag-claude", "claude");
      expect(await readTmuxSession(fmarkDir, "ag-claude")).toBe("fmark-x-ag-ag-claude");
      expect(await readRuntime(fmarkDir, "ag-claude")).toBe("claude");
    });
  });

  it("clearManagedSiblings keeps active-session and log.jsonl", async () => {
    await withTmpFmark(async (fmarkDir) => {
      await writeTmuxSession(fmarkDir, "ag-claude", "session");
      await writeRuntime(fmarkDir, "ag-claude", "claude");
      // create active-session and log.jsonl as siblings
      const dir = join(fmarkDir, "agents", "ag-claude");
      await writeFile(join(dir, "active-session"), "sess-1");
      await writeFile(join(dir, "log.jsonl"), "{}\n");
      await clearManagedSiblings(fmarkDir, "ag-claude");
      expect(await readTmuxSession(fmarkDir, "ag-claude")).toBeNull();
      expect(await readRuntime(fmarkDir, "ag-claude")).toBeNull();
      expect(await readFile(join(dir, "active-session"), "utf8")).toBe("sess-1");
      expect(await readFile(join(dir, "log.jsonl"), "utf8")).toBe("{}\n");
    });
  });

  it("listManagedAgentIds returns only ids with tmux-session file", async () => {
    await withTmpFmark(async (fmarkDir) => {
      await writeTmuxSession(fmarkDir, "ag-a", "s-a");
      // also create ag-b WITHOUT tmux-session
      const dir = join(fmarkDir, "agents", "ag-b");
      await import("node:fs/promises").then((f) => f.mkdir(dir, { recursive: true }));
      await writeFile(join(dir, "active-session"), "x");
      const ids = await listManagedAgentIds(fmarkDir);
      expect(ids).toEqual(["ag-a"]);
    });
  });
});
```

- [ ] **Step 2: Run (expect FAIL)**

- [ ] **Step 3: Implement**

```typescript
// packages/kernel/src/agents/managed.ts
import { mkdir, readFile, readdir, stat, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

const PARTICIPANT_RE = /^[a-z][a-z0-9-]{0,63}$/;

function assertValid(id: string): void {
  if (!PARTICIPANT_RE.test(id)) throw new Error(`invalid participant_id: ${id}`);
}

function agentDir(fmarkDir: string, id: string): string {
  return join(fmarkDir, "agents", id);
}

async function exists(p: string): Promise<boolean> {
  try { await stat(p); return true; } catch { return false; }
}

async function readOrNull(p: string): Promise<string | null> {
  try { return (await readFile(p, "utf8")).trim() || null; }
  catch (e: any) { if (e.code === "ENOENT") return null; throw e; }
}

export async function writeTmuxSession(fmarkDir: string, id: string, name: string): Promise<void> {
  assertValid(id);
  const dir = agentDir(fmarkDir, id);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "tmux-session"), name, "utf8");
}

export async function readTmuxSession(fmarkDir: string, id: string): Promise<string | null> {
  assertValid(id);
  return readOrNull(join(agentDir(fmarkDir, id), "tmux-session"));
}

export async function writeRuntime(fmarkDir: string, id: string, runtimeId: string): Promise<void> {
  assertValid(id);
  const dir = agentDir(fmarkDir, id);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "runtime"), runtimeId, "utf8");
}

export async function readRuntime(fmarkDir: string, id: string): Promise<string | null> {
  assertValid(id);
  return readOrNull(join(agentDir(fmarkDir, id), "runtime"));
}

export async function clearManagedSiblings(fmarkDir: string, id: string): Promise<void> {
  assertValid(id);
  const dir = agentDir(fmarkDir, id);
  for (const name of ["tmux-session", "runtime"]) {
    try { await unlink(join(dir, name)); } catch (e: any) { if (e.code !== "ENOENT") throw e; }
  }
}

export async function listManagedAgentIds(fmarkDir: string): Promise<string[]> {
  const root = join(fmarkDir, "agents");
  if (!(await exists(root))) return [];
  const entries = await readdir(root, { withFileTypes: true });
  const out: string[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (await exists(join(root, e.name, "tmux-session"))) out.push(e.name);
  }
  return out.sort();
}
```

- [ ] **Step 4: Run (expect PASS)**

- [ ] **Step 5: Commit**

```bash
git add packages/kernel/src/agents/managed.ts packages/kernel/tests/agents/managed.test.ts
git commit -m "feat(kernel/agents): tmux-session + runtime sibling-file helpers"
```

### Task 6.2: `agents/logs.ts` per-agent log writer

**Files:**
- Create: `packages/kernel/src/agents/logs.ts`
- Test: `packages/kernel/tests/agents/logs.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// packages/kernel/tests/agents/logs.test.ts
import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendAgentLog, readAgentLog, MAX_LOG_BYTES } from "../../src/agents/logs.js";

async function withTmp<T>(fn: (fmarkDir: string) => Promise<T>): Promise<T> {
  const d = await mkdtemp(join(tmpdir(), "fmark-log-"));
  try { return await fn(d); } finally { await rm(d, { recursive: true, force: true }); }
}

describe("agent logs", () => {
  it("appends entries as JSON lines", async () => {
    await withTmp(async (fmarkDir) => {
      await appendAgentLog(fmarkDir, "ag-x", { event: "spawn", runtime: "claude" });
      await appendAgentLog(fmarkDir, "ag-x", { event: "kill" });
      const entries = await readAgentLog(fmarkDir, "ag-x", { limit: 10 });
      expect(entries.map((e) => e.event)).toEqual(["spawn", "kill"]);
    });
  });

  it("rotates to .1 once size exceeds MAX_LOG_BYTES", async () => {
    await withTmp(async (fmarkDir) => {
      // create big log
      const big = "x".repeat(MAX_LOG_BYTES);
      const dir = join(fmarkDir, "agents", "ag-x");
      await import("node:fs/promises").then((f) => f.mkdir(dir, { recursive: true }));
      await writeFile(join(dir, "log.jsonl"), big);
      await appendAgentLog(fmarkDir, "ag-x", { event: "rotate-trigger" });
      const sizeOriginal = (await stat(join(dir, "log.jsonl"))).size;
      const sizeBackup = (await stat(join(dir, "log.jsonl.1"))).size;
      expect(sizeBackup).toBeGreaterThan(0);
      expect(sizeOriginal).toBeLessThan(MAX_LOG_BYTES);
    });
  });
});
```

- [ ] **Step 2: Run (expect FAIL)**

- [ ] **Step 3: Implement**

```typescript
// packages/kernel/src/agents/logs.ts
import { appendFile, mkdir, readFile, rename, stat } from "node:fs/promises";
import { join } from "node:path";

export const MAX_LOG_BYTES = 1_048_576;

const PARTICIPANT_RE = /^[a-z][a-z0-9-]{0,63}$/;

function assertValid(id: string): void {
  if (!PARTICIPANT_RE.test(id)) throw new Error(`invalid participant_id: ${id}`);
}

function logPath(fmarkDir: string, id: string): string {
  return join(fmarkDir, "agents", id, "log.jsonl");
}

async function fileSize(p: string): Promise<number> {
  try { return (await stat(p)).size; } catch { return 0; }
}

export interface AgentLogEntry {
  ts: string;
  event: string;
  [k: string]: unknown;
}

export async function appendAgentLog(
  fmarkDir: string,
  id: string,
  entry: Omit<AgentLogEntry, "ts"> & { ts?: string },
): Promise<void> {
  assertValid(id);
  const p = logPath(fmarkDir, id);
  await mkdir(join(fmarkDir, "agents", id), { recursive: true });
  const size = await fileSize(p);
  if (size > MAX_LOG_BYTES) {
    await rename(p, `${p}.1`);
  }
  const line = JSON.stringify({ ts: new Date().toISOString(), ...entry }) + "\n";
  await appendFile(p, line, "utf8");
}

export async function readAgentLog(
  fmarkDir: string,
  id: string,
  opts: { limit?: number } = {},
): Promise<AgentLogEntry[]> {
  assertValid(id);
  const p = logPath(fmarkDir, id);
  let txt = "";
  try { txt = await readFile(p, "utf8"); } catch (e: any) { if (e.code !== "ENOENT") throw e; return []; }
  const lines = txt.split("\n").filter((l) => l.trim().length > 0);
  const limit = opts.limit ?? 50;
  const tail = lines.slice(-limit);
  return tail.map((l) => JSON.parse(l) as AgentLogEntry);
}
```

- [ ] **Step 4: Run (expect PASS)**

- [ ] **Step 5: Commit**

```bash
git add packages/kernel/src/agents/logs.ts packages/kernel/tests/agents/logs.test.ts
git commit -m "feat(kernel/agents): per-agent log.jsonl with single-rotation"
```

### Task 6.3: managedAgents routes (spawn / kill / list / terminal / logs)

**Files:**
- Create: `packages/kernel/src/routes/managedAgents.ts`
- Test: `packages/kernel/tests/routes/managedAgents.test.ts`
- Modify: `packages/kernel/src/server.ts` (register routes; pass deps)

- [ ] **Step 1: Write failing tests**

Cover: spawn happy path, spawn with bad runtime → 400, spawn with bad participant id → 400, list, terminal-spawn, logs, kill without confirm → 403, kill with valid confirm → 200, kill with stale confirm → 403.

```typescript
// packages/kernel/tests/routes/managedAgents.test.ts
import { describe, expect, it } from "vitest";
import Fastify from "fastify";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerManagedAgentsRoutes } from "../../src/routes/managedAgents.js";
import { initProject } from "../../src/project.js";
import { createPathsForRoot } from "../../src/paths.js";
import { createPresenceTracker } from "../../src/presence/tracker.js";
import { fakeCommandRunner } from "../../src/tmux/commandRunner.js";
import { createTmuxManager } from "../../src/tmux/manager.js";

async function makeApp() {
  const root = await mkdtemp(join(tmpdir(), "fmark-mgd-r-"));
  const p = createPathsForRoot(root);
  await initProject(p);
  const runner = fakeCommandRunner();
  const mgr = createTmuxManager({ runner, projectRoot: root });
  const tracker = createPresenceTracker({ broadcast: () => {} });
  const app = Fastify();
  registerManagedAgentsRoutes(app, { paths: p, tmux: mgr, tracker, projectRoot: root });
  return { app, runner, root };
}

describe("POST /managed-agents/spawn", () => {
  it("creates participant, spawns tmux session, writes pointers", async () => {
    const { app, runner } = await makeApp();
    runner.expect(["tmux", "new-session"], { stdout: "", stderr: "", exitCode: 0 });
    runner.expect(["tmux", "set-option"], { stdout: "", stderr: "", exitCode: 0 });
    runner.expect(["tmux", "set-option"], { stdout: "", stderr: "", exitCode: 0 });
    const res = await app.inject({
      method: "POST",
      url: "/managed-agents/spawn",
      payload: { runtime_id: "claude", suggested_participant_id: "ag-claude-test", session_id: undefined },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.participant_id).toBe("ag-claude-test");
    expect(body.tmux_session).toMatch(/-ag-ag-claude-test$/);
    await app.close();
  });

  it("400 on unknown runtime", async () => {
    const { app } = await makeApp();
    const res = await app.inject({ method: "POST", url: "/managed-agents/spawn", payload: { runtime_id: "unknown" } });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

// (Add equivalent it() blocks for kill / list / terminal / logs / confirm-token flows.)
```

- [ ] **Step 2: Run (expect FAIL)**

- [ ] **Step 3: Implement the route module**

```typescript
// packages/kernel/src/routes/managedAgents.ts
import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { Paths } from "../paths.js";
import type { TmuxManager } from "../tmux/manager.js";
import type { PresenceTracker } from "../presence/tracker.js";
import { registerAgent, isValidParticipantId } from "../participants.js";
import { loadRuntimes } from "../runtimes/registry.js";
import {
  writeTmuxSession, readTmuxSession,
  writeRuntime, readRuntime, clearManagedSiblings, listManagedAgentIds,
} from "../agents/managed.js";
import { writeActiveSession } from "../agents/activeSession.js";
import { appendAgentLog, readAgentLog } from "../agents/logs.js";
import { fmarkTerminalSessionName } from "../tmux/naming.js";

interface SpawnBody {
  runtime_id: string;
  session_id?: string;
  name?: string;
  suggested_participant_id?: string;
}

interface TerminalBody { name?: string }

interface Deps {
  paths: Paths;
  tmux: TmuxManager;
  tracker: PresenceTracker;
  projectRoot: string;
}

const confirmTokens = new Map<string, { token: string; exp: number }>();
const CONFIRM_TTL_MS = 10_000;

function mintConfirm(id: string): string {
  const token = randomBytes(8).toString("hex");
  confirmTokens.set(id, { token, exp: Date.now() + CONFIRM_TTL_MS });
  return token;
}

function consumeConfirm(id: string, token: string): boolean {
  const entry = confirmTokens.get(id);
  if (!entry) return false;
  if (Date.now() > entry.exp) { confirmTokens.delete(id); return false; }
  if (entry.token !== token) return false;
  confirmTokens.delete(id);
  return true;
}

export function registerManagedAgentsRoutes(app: FastifyInstance, deps: Deps): void {
  const { paths, tmux, tracker, projectRoot } = deps;

  app.post<{ Body: SpawnBody }>("/managed-agents/spawn", async (req, reply) => {
    const { runtime_id, session_id, name, suggested_participant_id } = req.body ?? {};
    const runtimes = await loadRuntimes(paths.fmarkDir());
    const runtime = runtimes.runtimes[runtime_id];
    if (!runtime) { reply.code(400); return { error: `unknown runtime_id: ${runtime_id}` }; }
    let participantId = suggested_participant_id ?? `ag-${runtime_id}-${randomBytes(2).toString("hex")}`;
    if (!isValidParticipantId(participantId)) { reply.code(400); return { error: "invalid participant_id" }; }
    try {
      await registerAgent(paths, { name: name ?? runtime.displayName, suggested_id: participantId });
    } catch (e: any) {
      if (!String(e.message).includes("already registered")) throw e;
      // reuse existing
    }
    const { sessionName } = await tmux.spawnAgent({
      participantId,
      executable: runtime.executable,
      args: runtime.args,
      env: runtime.env,
    });
    await writeTmuxSession(paths.fmarkDir(), participantId, sessionName);
    await writeRuntime(paths.fmarkDir(), participantId, runtime_id);
    if (session_id !== undefined) {
      await writeActiveSession(paths.fmarkDir(), participantId, session_id);
    }
    tracker.setManagedPane(participantId, { paneAlive: async () => tmux.paneAlive(sessionName) as unknown as boolean });
    await appendAgentLog(paths.fmarkDir(), participantId, { event: "spawn", runtime: runtime_id, tmux_session: sessionName });
    return { participant_id: participantId, tmux_session: sessionName, runtime_id, hooks_status: "unknown" };
  });

  app.get<{ Params: { id: string } }>("/managed-agents/:id/confirm-token", async (req, reply) => {
    const id = decodeURIComponent(req.params.id);
    if (!isValidParticipantId(id)) { reply.code(400); return { error: "invalid id" }; }
    return { token: mintConfirm(id) };
  });

  app.delete<{ Params: { id: string }; Querystring: { confirm?: string } }>("/managed-agents/:id", async (req, reply) => {
    const id = decodeURIComponent(req.params.id);
    if (!isValidParticipantId(id)) { reply.code(400); return { error: "invalid id" }; }
    if (!req.query.confirm || !consumeConfirm(id, req.query.confirm)) {
      reply.code(403); return { error: "missing or stale confirm token" };
    }
    const session = await readTmuxSession(paths.fmarkDir(), id);
    if (session) await tmux.killSession(session);
    await clearManagedSiblings(paths.fmarkDir(), id);
    tracker.clearManagedPane(id);
    await appendAgentLog(paths.fmarkDir(), id, { event: "goodbye" });
    return { ok: true };
  });

  app.post<{ Body: TerminalBody }>("/managed-agents/terminal", async (req, reply) => {
    const existing = (await tmux.listFmarkSessions()).filter((s) => s.kind === "terminal");
    const index = (existing.reduce((m, s) => Math.max(m, s.index ?? 0), 0) ?? 0) + 1;
    const { sessionName } = await tmux.spawnTerminal({ index });
    return { tmux_session: sessionName, label: req.body?.name ?? `terminal ${index}` };
  });

  app.get("/managed-agents", async () => {
    const sessions = await tmux.listFmarkSessions();
    const agentIds = await listManagedAgentIds(paths.fmarkDir());
    const agents = [];
    for (const aid of agentIds) {
      const tmuxSession = await readTmuxSession(paths.fmarkDir(), aid);
      const runtimeId = await readRuntime(paths.fmarkDir(), aid);
      agents.push({ participant_id: aid, tmux_session: tmuxSession, runtime_id: runtimeId });
    }
    const terminals = sessions.filter((s) => s.kind === "terminal").map((s) => ({ tmux_session: s.sessionName, label: `terminal ${s.index}` }));
    return { agents, terminals };
  });

  app.get<{ Params: { id: string }; Querystring: { since?: string } }>("/managed-agents/:id/logs", async (req, reply) => {
    const id = decodeURIComponent(req.params.id);
    if (!isValidParticipantId(id)) { reply.code(400); return { error: "invalid id" }; }
    const limit = req.query.since ? Number(req.query.since) : 50;
    return { entries: await readAgentLog(paths.fmarkDir(), id, { limit }) };
  });
}
```

- [ ] **Step 4: Wire into server.ts**

```typescript
import { registerManagedAgentsRoutes } from "./routes/managedAgents.js";
import { createTmuxManager } from "./tmux/manager.js";
import { realCommandRunner } from "./tmux/commandRunner.js";
// in createServer:
const tmux = createTmuxManager({ runner: realCommandRunner(), projectRoot: deps.paths.root() });
registerManagedAgentsRoutes(app, { paths: deps.paths, tmux, tracker, projectRoot: deps.paths.root() });
```

- [ ] **Step 5: Run (expect PASS)**

- [ ] **Step 6: Commit**

```bash
git add packages/kernel/src/routes/managedAgents.ts packages/kernel/tests/routes/managedAgents.test.ts packages/kernel/src/server.ts
git commit -m "feat(kernel/routes): managed-agents spawn/kill/list/terminal/logs"
```

### Task 6.4: `--allow-process-api-no-auth` CLI flag + gated route registration

**Files:**
- Modify: `packages/kernel/src/cli.ts` (extend `CliOptions`)
- Modify: `packages/kernel/src/server.ts` (gate managed-agent + pane WS + command routes)
- Modify: `packages/kernel/src/banner.ts` (warn when `--no-auth` + `--allow-process-api-no-auth` both set)
- Test: `packages/kernel/tests/cli/allowProcessApi.test.ts` (parse), `packages/kernel/tests/security.test.ts` (extend with "spawn returns 404 when --no-auth without --allow-process-api-no-auth")

- [ ] **Step 1: Add failing CLI parse test**

```typescript
// packages/kernel/tests/cli/allowProcessApi.test.ts
import { describe, expect, it } from "vitest";
import { parseArgs } from "../../src/cli.js";

describe("--allow-process-api-no-auth", () => {
  it("parses the flag", () => {
    const o = parseArgs(["--no-auth", "--allow-process-api-no-auth"]);
    expect(o.noAuth).toBe(true);
    expect(o.allowProcessApiNoAuth).toBe(true);
  });
  it("defaults to false", () => {
    expect(parseArgs([]).allowProcessApiNoAuth).toBe(false);
  });
});
```

- [ ] **Step 2: Run (expect FAIL)**

- [ ] **Step 3: Implement in cli.ts**

```typescript
export interface CliOptions {
  // ... existing fields ...
  allowProcessApiNoAuth: boolean;
}
// in parseArgs: default to false
const options: CliOptions = { /* ... */, allowProcessApiNoAuth: false };
// in the switch:
case "--allow-process-api-no-auth":
  options.allowProcessApiNoAuth = true;
  break;
// in printUsage: add the flag line
```

- [ ] **Step 4: Gate route registration in server.ts**

```typescript
const allowProcessApi = (deps.token !== null) || deps.allowProcessApiNoAuth;
if (allowProcessApi) {
  registerManagedAgentsRoutes(app, { /* ... */ });
  registerHookInstallRoutes(app);
  registerPaneWebSocket(app, { tmux, hub });
} else {
  // Stub the routes to return 404 with a clear message.
  app.all("/managed-agents*", async (_req, reply) => {
    reply.code(404).send({ error: "process-spawning API disabled. Pass --allow-process-api-no-auth to enable under --no-auth." });
  });
}
```

(Pass `allowProcessApiNoAuth` through `ServerDeps` and `createServer`.)

- [ ] **Step 5: Update security.test.ts**

Add: when kernel starts with `--no-auth` and no `--allow-process-api-no-auth`, `POST /managed-agents/spawn` returns 404 (or 403).

- [ ] **Step 6: Update banner.ts**

When both flags are set, append a loud warning line to the banner output.

- [ ] **Step 7: Run + commit**

```bash
git add packages/kernel/src/cli.ts packages/kernel/src/server.ts packages/kernel/src/banner.ts packages/kernel/tests/cli/allowProcessApi.test.ts packages/kernel/tests/security.test.ts
git commit -m "feat(kernel/security): gate process-spawning routes behind --allow-process-api-no-auth under --no-auth"
```

### Phase 6 — Buddy verification

Brief: "Verify Phase 6. Confirm tests exercise both success and failure paths (unknown runtime, bad participant id, kill without confirm token). Confirm `registerManagedAgentsRoutes` is registered behind the existing bearer auth, AND that `--no-auth` without `--allow-process-api-no-auth` disables the spawn route entirely (not just unauthenticated — disabled). Confirm fake-tmux runner is the right shape and the spawn happy-path actually places the right argv. v0.3.0 baseline must still pass. Write `planning/buddy-reviews/2026-05-23-tmux-orchestration-phase-6.md`."

---

## Phase 7 — Pane WS subsystem

### Task 7.1: Pane channel manager with single-pipe fan-out

**Files:**
- Create: `packages/kernel/src/ws/pane.ts`
- Create: `packages/kernel/src/ws/paneHub.ts` (in-memory fan-out core, no Fastify dependency for testability)
- Test: `packages/kernel/tests/ws/paneHub.test.ts`

- [ ] **Step 1: Write failing test for the hub**

```typescript
// packages/kernel/tests/ws/paneHub.test.ts
import { describe, expect, it } from "vitest";
import { createPaneHub } from "../../src/ws/paneHub.js";

describe("PaneHub", () => {
  it("starts pipe on first subscriber, stops on last unsubscribe", async () => {
    const starts: string[] = [];
    const stops: string[] = [];
    const hub = createPaneHub({
      onStart: (id) => starts.push(id),
      onStop: (id) => stops.push(id),
    });
    const a = hub.subscribe("p1", () => {});
    expect(starts).toEqual(["p1"]);
    const b = hub.subscribe("p1", () => {});
    expect(starts).toEqual(["p1"]); // not started again
    a.unsubscribe();
    expect(stops).toEqual([]);
    b.unsubscribe();
    expect(stops).toEqual(["p1"]);
  });

  it("dispatches data to all subscribers", () => {
    const hub = createPaneHub({ onStart: () => {}, onStop: () => {} });
    const got: string[][] = [[], []];
    hub.subscribe("p", (d) => got[0]!.push(d));
    hub.subscribe("p", (d) => got[1]!.push(d));
    hub.feed("p", "hello");
    hub.feed("p", "world");
    expect(got[0]).toEqual(["hello", "world"]);
    expect(got[1]).toEqual(["hello", "world"]);
  });

  it("isolates panes from each other", () => {
    const hub = createPaneHub({ onStart: () => {}, onStop: () => {} });
    let got1 = ""; let got2 = "";
    hub.subscribe("p1", (d) => { got1 += d; });
    hub.subscribe("p2", (d) => { got2 += d; });
    hub.feed("p1", "A");
    hub.feed("p2", "B");
    expect(got1).toBe("A");
    expect(got2).toBe("B");
  });
});
```

- [ ] **Step 2: Run (expect FAIL)**

- [ ] **Step 3: Implement**

```typescript
// packages/kernel/src/ws/paneHub.ts
export interface PaneHubDeps {
  onStart(paneId: string): void;
  onStop(paneId: string): void;
}

export interface PaneHub {
  subscribe(paneId: string, listener: (chunk: string) => void): { unsubscribe(): void };
  feed(paneId: string, chunk: string): void;
  hasSubscribers(paneId: string): boolean;
}

export function createPaneHub(deps: PaneHubDeps): PaneHub {
  const subs = new Map<string, Set<(chunk: string) => void>>();
  return {
    subscribe(paneId, listener) {
      let set = subs.get(paneId);
      if (!set) {
        set = new Set();
        subs.set(paneId, set);
        deps.onStart(paneId);
      }
      set.add(listener);
      return {
        unsubscribe() {
          set!.delete(listener);
          if (set!.size === 0) {
            subs.delete(paneId);
            deps.onStop(paneId);
          }
        },
      };
    },
    feed(paneId, chunk) {
      const set = subs.get(paneId);
      if (!set) return;
      for (const fn of set) fn(chunk);
    },
    hasSubscribers(paneId) { return (subs.get(paneId)?.size ?? 0) > 0; },
  };
}
```

- [ ] **Step 4: Run (expect PASS)**

- [ ] **Step 5: Commit**

```bash
git add packages/kernel/src/ws/paneHub.ts packages/kernel/tests/ws/paneHub.test.ts
git commit -m "feat(kernel/ws): pane hub with single-pipe fan-out semantics"
```

### Task 7.2: WS endpoint `/ws/pane` + pipe-pane bridge

**Files:**
- Create: `packages/kernel/src/ws/pane.ts`
- Test: `packages/kernel/tests/ws/pane.test.ts` (integration test with Fastify-inject + WS client)
- Modify: `packages/kernel/src/server.ts` (register endpoint)

- [ ] **Step 1: Write failing integration test**

(Use `@fastify/websocket` test pattern; spawn an in-process WS client; assert snapshot + data + input flow with fake command runner. Reference `packages/kernel/tests/ws.test.ts` for existing pattern.)

- [ ] **Step 2: Run (expect FAIL)**

- [ ] **Step 3: Implement**

```typescript
// packages/kernel/src/ws/pane.ts
import { createReadStream, promises as fsp } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import type { TmuxManager } from "../tmux/manager.js";
import { validateMessageText } from "../runtimes/validation.js";
import type { PaneHub } from "./paneHub.js";

export interface PaneWsDeps {
  tmux: TmuxManager;
  hub: PaneHub;
}

export function registerPaneWebSocket(app: FastifyInstance, deps: PaneWsDeps): void {
  const { tmux, hub } = deps;
  const pipeState = new Map<string, { fifo: string; cleanup: () => Promise<void> }>();

  async function startPipe(paneId: string): Promise<void> {
    const dir = await mkdtemp(join(tmpdir(), "fmark-pipe-"));
    const fifo = join(dir, "fifo");
    // POSIX mkfifo via child process; fall back to regular file if mkfifo not available
    const { spawn } = await import("node:child_process");
    await new Promise<void>((resolve, reject) => {
      const c = spawn("mkfifo", [fifo]);
      c.on("close", (code) => code === 0 ? resolve() : reject(new Error(`mkfifo exit ${code}`)));
    });
    await tmux.startPipePane(paneId, fifo);
    const stream = createReadStream(fifo, { encoding: "utf8" });
    stream.on("data", (chunk) => hub.feed(paneId, String(chunk)));
    pipeState.set(paneId, {
      fifo,
      cleanup: async () => {
        try { stream.destroy(); } catch {}
        try { await tmux.stopPipePane(paneId); } catch {}
        try { await fsp.unlink(fifo); await fsp.rmdir(dir); } catch {}
      },
    });
  }

  async function stopPipe(paneId: string): Promise<void> {
    const s = pipeState.get(paneId);
    if (!s) return;
    pipeState.delete(paneId);
    await s.cleanup();
  }

  // Hub onStart/onStop are wired in createServer using closures over startPipe/stopPipe.

  app.get("/ws/pane", { websocket: true }, async (socket, req) => {
    const url = new URL(req.url ?? "/", "http://internal");
    const paneId = url.searchParams.get("session");
    if (!paneId) { socket.close(); return; }
    try {
      const snapshot = await tmux.captureSnapshot(paneId);
      socket.send(JSON.stringify({ type: "pane.snapshot", data: snapshot }));
    } catch {}
    const sub = hub.subscribe(paneId, (chunk) => {
      try { socket.send(JSON.stringify({ type: "pane.data", data: chunk })); } catch {}
    });
    socket.on("message", async (raw: Buffer) => {
      let msg: any;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      try {
        if (msg.type === "pane.input" && typeof msg.data === "string") {
          validateMessageText(msg.data);
          await tmux.sendLiteralText(paneId, msg.data);
        } else if (msg.type === "pane.key" && typeof msg.key === "string") {
          await tmux.sendKey(paneId, msg.key);
        } else if (msg.type === "pane.resize") {
          await tmux.resize(paneId, Number(msg.cols), Number(msg.rows));
        }
      } catch (e: any) {
        socket.send(JSON.stringify({ type: "pane.error", error: e.message }));
      }
    });
    socket.on("close", () => sub.unsubscribe());
  });

  return { startPipe, stopPipe } as unknown as void; // wiring done by createServer
}
```

- [ ] **Step 4: Wire startPipe / stopPipe into the hub in `server.ts`**

```typescript
import { createPaneHub } from "./ws/paneHub.js";
import { registerPaneWebSocket } from "./ws/pane.js";
// in createServer:
let pipeBootstrapped = false;
const hub = createPaneHub({
  onStart: (paneId) => { /* set by registerPaneWebSocket via closure */ },
  onStop: (paneId) => { /* same */ },
});
// (Pass startPipe/stopPipe back into hub by passing the hub-with-callbacks to registerPaneWebSocket.)
```

(Refactor `registerPaneWebSocket` if needed so the hub callbacks call the startPipe/stopPipe internals — clearest approach: define `registerPaneWebSocket` to return `{ startPipe, stopPipe }`, then construct the hub with those references.)

- [ ] **Step 5: Run (expect PASS)**

- [ ] **Step 6: Commit**

```bash
git add packages/kernel/src/ws/pane.ts packages/kernel/tests/ws/pane.test.ts packages/kernel/src/server.ts
git commit -m "feat(kernel/ws): /ws/pane endpoint with single pipe-pane fan-out"
```

### Phase 7 — Buddy verification

Brief: "Verify Phase 7. Confirm only one pipe-pane is started per pane regardless of subscriber count (the key spec property). Confirm the WS endpoint correctly forwards snapshot → data → input/key/resize. Confirm cleanup happens on disconnect. v0.3.0 baseline still green. Write `planning/buddy-reviews/2026-05-23-tmux-orchestration-phase-7.md`."

---

## Phase 8 — `/command` route + per-pane input queue integration

### Task 8.1: Command route

**Files:**
- Add to `packages/kernel/src/routes/managedAgents.ts` (extend existing module)
- Test: `packages/kernel/tests/routes/managedAgentsCommand.test.ts`

- [ ] **Step 1: Write failing tests** covering: interrupt, slash compact, message free text, slash with bad command name → 400, message with control char → 400, unmanaged participant → 409.

- [ ] **Step 2: Run (expect FAIL)**

- [ ] **Step 3: Implement**

```typescript
// add to managedAgents.ts (inside registerManagedAgentsRoutes)
import { createInputQueue } from "../tmux/inputQueue.js";
import { validateSlashCommand, validateMessageText } from "../runtimes/validation.js";

const inputQueue = createInputQueue();

app.post<{ Params: { id: string }; Body: { type: string; command?: string; text?: string } }>(
  "/managed-agents/:id/command",
  async (req, reply) => {
    const id = decodeURIComponent(req.params.id);
    if (!isValidParticipantId(id)) { reply.code(400); return { error: "invalid id" }; }
    const session = await readTmuxSession(paths.fmarkDir(), id);
    if (!session) { reply.code(409); return { reason: "unmanaged_pane", offer: "open_overlay" }; }
    const body = req.body ?? {} as any;
    try {
      if (body.type === "interrupt") {
        await inputQueue.enqueue(session, () => tmux.sendKey(session, "C-c"));
      } else if (body.type === "slash") {
        validateSlashCommand(body.command);
        await inputQueue.enqueue(session, async () => {
          await tmux.sendLiteralText(session, `/${body.command}`);
          await tmux.sendKey(session, "C-m");
        });
      } else if (body.type === "message") {
        validateMessageText(body.text);
        await inputQueue.enqueue(session, async () => {
          await tmux.sendLiteralText(session, body.text);
          await tmux.sendKey(session, "C-m");
        });
      } else {
        reply.code(400); return { error: "unknown command type" };
      }
      await appendAgentLog(paths.fmarkDir(), id, { event: "command", type: body.type });
      return { ok: true };
    } catch (e: any) {
      reply.code(400); return { error: e.message };
    }
  },
);
```

- [ ] **Step 4: Run (expect PASS)**

- [ ] **Step 5: Commit**

```bash
git add packages/kernel/src/routes/managedAgents.ts packages/kernel/tests/routes/managedAgentsCommand.test.ts
git commit -m "feat(kernel/routes): managed-agent command (interrupt/slash/message) via input queue"
```

### Phase 8 — Buddy verification

Brief: "Verify Phase 8. Confirm: control-char rejection works for message text, slash regex enforced, 409 returned for unmanaged panes, input queue serializes operations per pane. Write `planning/buddy-reviews/2026-05-23-tmux-orchestration-phase-8.md`."

---

## Phase 9 — Reconcile on startup

### Task 9.1: reconcile.ts

**Files:**
- Create: `packages/kernel/src/reconcile.ts`
- Test: `packages/kernel/tests/reconcile.test.ts`
- Modify: `packages/kernel/src/index.ts` (call after server start)

- [ ] **Step 1: Write failing test** covering 3 cases (agent dir + session alive → stale; agent dir without session → pane-dead + sibling cleared; terminal session + no agent dir → kept; orphan agent session + no agent dir → killed).

- [ ] **Step 2: Run (expect FAIL)**

- [ ] **Step 3: Implement**

```typescript
// packages/kernel/src/reconcile.ts
import type { Paths } from "./paths.js";
import type { TmuxManager } from "./tmux/manager.js";
import type { PresenceTracker } from "./presence/tracker.js";
import { listManagedAgentIds, readTmuxSession, clearManagedSiblings, readRuntime } from "./agents/managed.js";
import { appendAgentLog } from "./agents/logs.js";
import { checkHookInstallStatus } from "./hooksInstall/index.js";

export interface ReconcileDeps {
  paths: Paths;
  tmux: TmuxManager;
  tracker: PresenceTracker;
}

export async function reconcile(deps: ReconcileDeps): Promise<void> {
  const { paths, tmux, tracker } = deps;
  const ver = await tmux.getVersion();
  if (!ver) return; // tmux unavailable; feature disabled
  const sessions = await tmux.listFmarkSessions();
  const liveAgentSessions = new Set(sessions.filter((s) => s.kind === "agent").map((s) => s.sessionName));
  const liveAgentParticipants = new Set(sessions.filter((s) => s.kind === "agent").map((s) => s.participantId!));
  const agentIds = await listManagedAgentIds(paths.fmarkDir());

  for (const aid of agentIds) {
    const expected = await readTmuxSession(paths.fmarkDir(), aid);
    if (expected && liveAgentSessions.has(expected)) {
      tracker.setManagedPane(aid, { paneAlive: async () => tmux.paneAlive(expected) as unknown as boolean });
      const runtimeId = await readRuntime(paths.fmarkDir(), aid);
      if (runtimeId) {
        const status = await checkHookInstallStatus({ runtimeId, participantId: aid });
        tracker.setManagedHookStatus(aid, status.installed);
      }
    } else {
      await clearManagedSiblings(paths.fmarkDir(), aid);
      tracker.clearManagedPane(aid);
      await appendAgentLog(paths.fmarkDir(), aid, { event: "pane-died" });
    }
  }

  // Kill orphan agent sessions (tmux session exists but no agent dir).
  for (const s of sessions) {
    if (s.kind === "agent" && s.participantId && !agentIds.includes(s.participantId)) {
      await tmux.killSession(s.sessionName);
    }
  }
}
```

- [ ] **Step 4: Wire into `index.ts`**

After `app.listen()` succeeds:

```typescript
import { reconcile } from "./reconcile.js";
// ...
await reconcile({ paths, tmux, tracker });
```

- [ ] **Step 5: Run (expect PASS)**

- [ ] **Step 6: Commit**

```bash
git add packages/kernel/src/reconcile.ts packages/kernel/tests/reconcile.test.ts packages/kernel/src/index.ts
git commit -m "feat(kernel/reconcile): startup reconciliation of surviving tmux sessions"
```

### Phase 9 — Buddy verification

Brief: "Verify Phase 9 covers the three reconcile cases. Confirm tracker state is correctly seeded post-reconcile. Write `planning/buddy-reviews/2026-05-23-tmux-orchestration-phase-9.md`."

---

## Phase 10 — Env probe + Guide update

### Task 10.1: Env probe route

**Files:**
- Create: `packages/kernel/src/routes/envProbe.ts`
- Test: `packages/kernel/tests/routes/envProbe.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
import { describe, expect, it } from "vitest";
import Fastify from "fastify";
import { registerEnvProbeRoute } from "../../src/routes/envProbe.js";

describe("GET /env-probe", () => {
  it("reports tmux + runtimes + installer", async () => {
    const app = Fastify();
    registerEnvProbeRoute(app, {
      probe: async () => ({
        tmux: true,
        tmuxVersion: "3.4",
        runtimes: { claude: true, codex: false, gemini: false },
        installer: "apt",
        os: "linux",
      }),
    });
    const res = await app.inject({ method: "GET", url: "/env-probe" });
    expect(res.statusCode).toBe(200);
    expect(res.json().tmux).toBe(true);
    expect(res.json().installer).toBe("apt");
    await app.close();
  });
});
```

- [ ] **Step 2: Run (expect FAIL)**

- [ ] **Step 3: Implement** with realProbe using `which`:

```typescript
// packages/kernel/src/routes/envProbe.ts
import type { FastifyInstance } from "fastify";
import { realCommandRunner, type CommandRunner } from "../tmux/commandRunner.js";

export interface EnvProbeResult {
  tmux: boolean;
  tmuxVersion: string | null;
  runtimes: Record<string, boolean>;
  installer: string | null;
  os: string;
}

export interface ProbeDeps {
  probe(): Promise<EnvProbeResult>;
}

export function realProbe(runtimes: string[]): () => Promise<EnvProbeResult> {
  const runner = realCommandRunner();
  return async () => {
    const which = async (name: string) => (await runner.run(["which", name])).exitCode === 0;
    const tmux = await which("tmux");
    let tmuxVersion: string | null = null;
    if (tmux) {
      const r = await runner.run(["tmux", "-V"]);
      const m = /^tmux\s+(\d+\.\d+)/.exec(r.stdout.trim());
      tmuxVersion = m ? m[1]! : null;
    }
    const rt: Record<string, boolean> = {};
    for (const id of runtimes) rt[id] = await which(id);
    const installers = ["brew", "apt", "dnf", "yum", "zypper", "port", "pacman"] as const;
    let installer: string | null = null;
    for (const inst of installers) { if (await which(inst)) { installer = inst; break; } }
    return { tmux, tmuxVersion, runtimes: rt, installer, os: process.platform };
  };
}

export function registerEnvProbeRoute(app: FastifyInstance, deps: ProbeDeps): void {
  let cached: { result: EnvProbeResult; exp: number } | null = null;
  const TTL = 30_000;
  app.get("/env-probe", async () => {
    if (cached && Date.now() < cached.exp) return cached.result;
    const result = await deps.probe();
    cached = { result, exp: Date.now() + TTL };
    return result;
  });
}
```

- [ ] **Step 4: Wire into server.ts**

```typescript
import { registerEnvProbeRoute, realProbe } from "./routes/envProbe.js";
// in createServer, near other route registrations:
const probeFn = realProbe(["claude", "codex", "gemini"]);
registerEnvProbeRoute(app, { probe: probeFn });
```

- [ ] **Step 5: Run + commit**

```bash
git add packages/kernel/src/routes/envProbe.ts packages/kernel/tests/routes/envProbe.test.ts packages/kernel/src/server.ts
git commit -m "feat(kernel/routes): GET /env-probe with PATH-based detection"
```

### Task 10.2: Guide route extension

**Files:**
- Modify: `packages/kernel/src/routes/guide.ts`
- Update: `packages/kernel/tests/routes/guide.test.ts` (or create if absent)

- [ ] **Step 1: Add failing test asserting `agent_id`, `runtime_id` query support and removal of "NOT YET SHIPPED" text**

- [ ] **Step 2: Run (expect FAIL)**

- [ ] **Step 3: Modify route**

Replace `interface GuideQuery` and `buildGuide` signature:

```typescript
interface GuideQuery {
  session_id?: string;
  sessionId?: string; // backward-compat alias
  agent_id?: string;
  runtime_id?: string;
}

function buildGuide(opts: {
  baseUrl: string;
  agentMd: string;
  sessionId?: string;
  agentId?: string;
  runtimeId?: string;
}): string {
  // ... extend sessionSection logic ...
  // - replace the "Hooks (NOT YET SHIPPED)" block with runtime-specific install instructions
  // - if agentId is set, substitute "<your-agent-id>" with `agentId`
  // - if both agentId and sessionId are set, render a first-message snippet
}
```

(Full implementation: ~40 lines of conditional markdown construction. Keep it tight; reuse the existing template structure.)

In the route handler:

```typescript
const sessionId = req.query.session_id ?? req.query.sessionId;
const agentId = req.query.agent_id;
const runtimeId = req.query.runtime_id;
// pass to buildGuide
```

- [ ] **Step 4: Run (expect PASS)**

- [ ] **Step 5: Commit**

```bash
git add packages/kernel/src/routes/guide.ts packages/kernel/tests/routes/guide.test.ts
git commit -m "feat(kernel/routes): /guide accepts agent_id + runtime_id; fix stale hooks copy"
```

### Phase 10 — Buddy verification

Brief: "Verify Phase 10. Confirm env-probe correctly detects what's on PATH on the local machine (run the test on the dev machine, observe actual output). Confirm guide route handles all query combinations + backward-compat sessionId. Write `planning/buddy-reviews/2026-05-23-tmux-orchestration-phase-10.md`."

---

## Phase 11 — Hook install status (read-only)

### Task 11.1: Claude adapter (parse settings.json)

**Files:**
- Create: `packages/kernel/src/hooksInstall/types.ts`
- Create: `packages/kernel/src/hooksInstall/claude.ts`
- Test: `packages/kernel/tests/hooksInstall/claude.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// packages/kernel/tests/hooksInstall/claude.test.ts
import { describe, expect, it } from "vitest";
import { detectClaudeHooks, renderClaudeInstallSnippet } from "../../src/hooksInstall/claude.js";

describe("Claude hooks adapter", () => {
  it("detects installed when both Stop and UserPromptSubmit hooks reference the participant id", () => {
    const settings = {
      hooks: {
        Stop: [{ hooks: [{ type: "command", command: "npx -y f-mark hook auto-stream ag-claude" }] }],
        UserPromptSubmit: [{ hooks: [{ type: "command", command: "npx -y f-mark hook auto-stream us-1 --kind user" }] }],
      },
    };
    const r = detectClaudeHooks(settings, "ag-claude", "us-1");
    expect(r.installed).toBe(true);
    expect(r.detectedEntries.length).toBe(2);
  });

  it("partial install reported as not installed", () => {
    const settings = { hooks: { Stop: [{ hooks: [{ type: "command", command: "npx -y f-mark hook auto-stream ag-claude" }] }] } };
    const r = detectClaudeHooks(settings, "ag-claude", "us-1");
    expect(r.installed).toBe(false);
  });

  it("renders a valid snippet with the right ids", () => {
    const s = renderClaudeInstallSnippet("ag-claude", "us-1");
    expect(s).toContain("ag-claude");
    expect(s).toContain("us-1");
    expect(s).toContain("UserPromptSubmit");
    expect(s).toContain("Stop");
  });
});
```

- [ ] **Step 2: Run (expect FAIL)**

- [ ] **Step 3: Implement**

```typescript
// packages/kernel/src/hooksInstall/types.ts
export interface HookEntry { event: string; command: string; }
export interface DetectResult {
  installed: boolean;
  configPath: string;
  detectedEntries: HookEntry[];
  expectedEntries: HookEntry[];
}
```

```typescript
// packages/kernel/src/hooksInstall/claude.ts
import { homedir } from "node:os";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { DetectResult, HookEntry } from "./types.js";

export function claudeConfigPath(): string {
  return join(homedir(), ".claude", "settings.json");
}

export function detectClaudeHooks(
  settings: any,
  agentId: string,
  userId: string,
): DetectResult {
  const detected: HookEntry[] = [];
  const hooks = settings?.hooks ?? {};
  for (const event of ["Stop", "UserPromptSubmit"]) {
    const arr = hooks[event] ?? [];
    for (const group of arr) {
      for (const h of group.hooks ?? []) {
        if (typeof h.command === "string" && h.command.includes("f-mark hook auto-stream")) {
          if ((event === "Stop" && h.command.includes(agentId)) || (event === "UserPromptSubmit" && h.command.includes(userId))) {
            detected.push({ event, command: h.command });
          }
        }
      }
    }
  }
  const installed = detected.some((e) => e.event === "Stop") && detected.some((e) => e.event === "UserPromptSubmit");
  return {
    installed,
    configPath: claudeConfigPath(),
    detectedEntries: detected,
    expectedEntries: [
      { event: "Stop", command: `npx -y f-mark hook auto-stream ${agentId}` },
      { event: "UserPromptSubmit", command: `npx -y f-mark hook auto-stream ${userId} --kind user` },
    ],
  };
}

export async function loadClaudeSettings(): Promise<unknown | null> {
  try { return JSON.parse(await readFile(claudeConfigPath(), "utf8")); }
  catch { return null; }
}

export function renderClaudeInstallSnippet(agentId: string, userId: string): string {
  return [
    "Add these two entries to `~/.claude/settings.json` under `hooks`:",
    "",
    "```json",
    '"hooks": {',
    '  "Stop": [',
    "    {",
    '      "hooks": [',
    `        { "type": "command", "command": "npx -y f-mark hook auto-stream ${agentId}" }`,
    "      ]",
    "    }",
    "  ],",
    '  "UserPromptSubmit": [',
    "    {",
    '      "hooks": [',
    `        { "type": "command", "command": "npx -y f-mark hook auto-stream ${userId} --kind user" }`,
    "      ]",
    "    }",
    "  ]",
    "}",
    "```",
  ].join("\n");
}
```

- [ ] **Step 4: Run + commit**

```bash
git add packages/kernel/src/hooksInstall/{types,claude}.ts packages/kernel/tests/hooksInstall/claude.test.ts
git commit -m "feat(kernel/hooks-install): claude adapter — detect + render"
```

### Task 11.2: Codex adapter

Same pattern as 11.1 but parses TOML.

**Files:**
- Create: `packages/kernel/src/hooksInstall/codex.ts`
- Test: `packages/kernel/tests/hooksInstall/codex.test.ts`

- [ ] **Step 1: Add TOML parser dep**

```bash
pnpm --filter @f-mark/kernel add smol-toml
```

(Verify the kernel package already has `gray-matter` etc.; if `smol-toml` isn't desired, use a regex-based extractor for v0.4 — the only thing we need is matching `[[hooks.Stop]] command = "..."` arrays. A regex parser is acceptable given Codex's TOML hook section is narrowly shaped.)

For v0.4 use a regex-based parser to keep the diff small:

```typescript
// packages/kernel/src/hooksInstall/codex.ts
import { homedir } from "node:os";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { DetectResult, HookEntry } from "./types.js";

export function codexConfigPath(): string {
  return join(homedir(), ".codex", "config.toml");
}

const HOOK_BLOCK_RE = /\[\[hooks\.(Stop|UserPromptSubmit)\]\][^\[]*?command\s*=\s*\[?([^\n\]]+)\]?/gms;

export function detectCodexHooks(toml: string, agentId: string, userId: string): DetectResult {
  const detected: HookEntry[] = [];
  let m: RegExpExecArray | null;
  while ((m = HOOK_BLOCK_RE.exec(toml)) !== null) {
    const event = m[1]!;
    const cmd = m[2]!;
    if (cmd.includes("f-mark") && cmd.includes("auto-stream")) {
      if ((event === "Stop" && cmd.includes(agentId)) || (event === "UserPromptSubmit" && cmd.includes(userId))) {
        detected.push({ event, command: cmd });
      }
    }
  }
  const installed = detected.some((e) => e.event === "Stop") && detected.some((e) => e.event === "UserPromptSubmit");
  return {
    installed,
    configPath: codexConfigPath(),
    detectedEntries: detected,
    expectedEntries: [
      { event: "Stop", command: `["npx", "-y", "f-mark", "hook", "auto-stream", "${agentId}"]` },
      { event: "UserPromptSubmit", command: `["npx", "-y", "f-mark", "hook", "auto-stream", "${userId}", "--kind", "user"]` },
    ],
  };
}

export async function loadCodexConfig(): Promise<string> {
  try { return await readFile(codexConfigPath(), "utf8"); }
  catch { return ""; }
}

export function renderCodexInstallSnippet(agentId: string, userId: string): string {
  return [
    "Add to `~/.codex/config.toml` (or `.codex/config.toml` for project-scoped):",
    "",
    "```toml",
    "[[hooks.Stop]]",
    `command = ["npx", "-y", "f-mark", "hook", "auto-stream", "${agentId}"]`,
    "timeout = 30",
    "",
    "[[hooks.UserPromptSubmit]]",
    `command = ["npx", "-y", "f-mark", "hook", "auto-stream", "${userId}", "--kind", "user"]`,
    "timeout = 10",
    "```",
    "",
    "On first run, Codex will prompt you to trust the hook command. Approve once.",
  ].join("\n");
}
```

Tests mirror 11.1.

- [ ] **Steps 2–5: Write test → Run FAIL → Implement → Run PASS → Commit**

```bash
git add packages/kernel/src/hooksInstall/codex.ts packages/kernel/tests/hooksInstall/codex.test.ts
git commit -m "feat(kernel/hooks-install): codex adapter — detect + render"
```

### Task 11.3: Gemini stub + dispatcher + routes

**Files:**
- Create: `packages/kernel/src/hooksInstall/gemini.ts`
- Create: `packages/kernel/src/hooksInstall/index.ts`
- Create: `packages/kernel/src/routes/hookInstall.ts`
- Test: `packages/kernel/tests/routes/hookInstall.test.ts`

- [ ] **Step 1: Write failing test for routes + Gemini stub**

```typescript
// gemini stub returns installed: false with note "manual-stream mode"
// index.ts dispatches by runtime_id
// route GET /managed-agents/hook-install-status?runtime_id=claude&participant_id=...&user_participant_id=...
// route POST /managed-agents/hook-install-instructions ... returns markdown
```

- [ ] **Step 2: Run (expect FAIL)**

- [ ] **Step 3: Implement**

```typescript
// packages/kernel/src/hooksInstall/gemini.ts
import type { DetectResult } from "./types.js";
export function detectGeminiHooks(): DetectResult {
  return {
    installed: false,
    configPath: "(manual-stream mode — no hooks needed in v0.4)",
    detectedEntries: [],
    expectedEntries: [],
  };
}
export function renderGeminiInstallSnippet(): string {
  return "Gemini CLI uses **manual-stream mode** in F-Mark v0.4. The model itself POSTs prose, tool-use, and turn-end events — no hooks needed. See `.f-mark/AGENT.md` for the protocol the model follows.";
}
```

```typescript
// packages/kernel/src/hooksInstall/index.ts
import { detectClaudeHooks, loadClaudeSettings, renderClaudeInstallSnippet } from "./claude.js";
import { detectCodexHooks, loadCodexConfig, renderCodexInstallSnippet } from "./codex.js";
import { detectGeminiHooks, renderGeminiInstallSnippet } from "./gemini.js";
import type { DetectResult } from "./types.js";

export async function checkHookInstallStatus(opts: {
  runtimeId: string;
  participantId: string;
  userParticipantId?: string;
}): Promise<DetectResult> {
  const userId = opts.userParticipantId ?? "us-unknown";
  if (opts.runtimeId === "claude") {
    const settings = await loadClaudeSettings();
    return detectClaudeHooks(settings ?? {}, opts.participantId, userId);
  }
  if (opts.runtimeId === "codex") {
    const toml = await loadCodexConfig();
    return detectCodexHooks(toml, opts.participantId, userId);
  }
  if (opts.runtimeId === "gemini") return detectGeminiHooks();
  throw new Error(`unknown runtime_id: ${opts.runtimeId}`);
}

export function renderInstallInstructions(opts: {
  runtimeId: string;
  participantId: string;
  userParticipantId: string;
}): { markdown: string; manualSteps: { configPath: string; snippet: string }[] } {
  if (opts.runtimeId === "claude") {
    const snippet = renderClaudeInstallSnippet(opts.participantId, opts.userParticipantId);
    return { markdown: snippet, manualSteps: [{ configPath: "~/.claude/settings.json", snippet }] };
  }
  if (opts.runtimeId === "codex") {
    const snippet = renderCodexInstallSnippet(opts.participantId, opts.userParticipantId);
    return { markdown: snippet, manualSteps: [{ configPath: "~/.codex/config.toml", snippet }] };
  }
  if (opts.runtimeId === "gemini") {
    const snippet = renderGeminiInstallSnippet();
    return { markdown: snippet, manualSteps: [] };
  }
  throw new Error(`unknown runtime_id: ${opts.runtimeId}`);
}
```

```typescript
// packages/kernel/src/routes/hookInstall.ts
import type { FastifyInstance } from "fastify";
import { checkHookInstallStatus, renderInstallInstructions } from "../hooksInstall/index.js";

export function registerHookInstallRoutes(app: FastifyInstance): void {
  app.get<{ Querystring: { runtime_id?: string; participant_id?: string; user_participant_id?: string } }>(
    "/managed-agents/hook-install-status",
    async (req, reply) => {
      const { runtime_id, participant_id, user_participant_id } = req.query;
      if (!runtime_id || !participant_id) { reply.code(400); return { error: "runtime_id and participant_id required" }; }
      return checkHookInstallStatus({ runtimeId: runtime_id, participantId: participant_id, userParticipantId: user_participant_id });
    },
  );
  app.post<{ Querystring: { runtime_id?: string; participant_id?: string; user_participant_id?: string } }>(
    "/managed-agents/hook-install-instructions",
    async (req, reply) => {
      const { runtime_id, participant_id, user_participant_id } = req.query;
      if (!runtime_id || !participant_id || !user_participant_id) { reply.code(400); return { error: "all params required" }; }
      return renderInstallInstructions({ runtimeId: runtime_id, participantId: participant_id, userParticipantId: user_participant_id });
    },
  );
}
```

- [ ] **Step 4: Wire into server.ts + run + commit**

```bash
git add packages/kernel/src/hooksInstall/ packages/kernel/src/routes/hookInstall.ts packages/kernel/tests/{hooksInstall,routes}/hookInstall*.test.ts packages/kernel/src/server.ts
git commit -m "feat(kernel/hooks-install): status + instructions routes (read-only)"
```

### Phase 11 — Buddy verification

Brief: "Verify Phase 11. Confirm hook-install-status correctly handles 3 cases per runtime (installed, partial, missing); rendered snippets are syntactically valid (parse-able JSON and TOML samples). Write `planning/buddy-reviews/2026-05-23-tmux-orchestration-phase-11.md`."

---

## Phase 12 — Renderer UI

### Task 12.1: Shared managedAgents types + API client

**Files:**
- Create: `packages/shared/src/managedAgents.ts`
- Create: `packages/renderer/src/api/managedAgents.ts`
- Test: `packages/renderer/tests/api/managedAgents.test.ts`

- [ ] **Steps 1–5:** test → implement → commit.

```typescript
// packages/shared/src/managedAgents.ts
export type PresenceState = "launching" | "online" | "stale" | "offline" | "pane-dead" | "hook-not-installed";
export interface ManagedAgent {
  participant_id: string;
  tmux_session: string | null;
  runtime_id: string | null;
}
export interface ManagedTerminal {
  tmux_session: string;
  label: string;
}
export interface SpawnResponse {
  participant_id: string;
  tmux_session: string;
  runtime_id: string;
  hooks_status: "installed" | "missing" | "unknown";
}
```

```typescript
// packages/renderer/src/api/managedAgents.ts
// Standard fetch wrappers around the kernel routes (spawn, kill+confirm, terminal, list, logs, command, hook-install-*).
```

```bash
git commit -m "feat(renderer/api): managedAgents client + shared types"
```

### Task 12.2: Presence Zustand slice

**Files:**
- Create: `packages/renderer/src/state/presence.ts`
- Modify: `packages/renderer/src/state/store.ts` to wire new WS message types

- [ ] **Steps:** TDD pattern, then commit.

### Task 12.3: AgentChip + TerminalChip + PlusButton + AgentActionMenu

**Files:**
- Create the four component files
- RTL tests for each

- [ ] **Each component:** TDD pattern. Use existing chip styling from `shell.css`. Keep state-dot color semantics consistent (green/amber/gray + pulse anim for "thinking").

### Task 12.4: TerminalOverlay (xterm.js modal)

**Files:**
- Create: `packages/renderer/src/lib/xtermBridge.ts`
- Create: `packages/renderer/src/modals/TerminalOverlay.tsx`
- Test: `packages/renderer/tests/modals/terminalOverlay.test.tsx`

- [ ] **Step 1: Add xterm dep**

```bash
pnpm --filter @f-mark/renderer add @xterm/xterm @xterm/addon-fit
```

- [ ] **Step 2: Bridge module**: WS connection to `/ws/pane?session=...`, route snapshot/data → `term.write`, term `onData` → `send({ type: "pane.input", data })`, resize → `pane.resize`.

- [ ] **Step 3: Modal**: hosts the xterm instance, attach/detach lifecycle, kill button (calls DELETE), tab strip if multiple panes open.

- [ ] **Step 4: RTL test** uses an xterm mock (e.g., spy on Terminal class). Confirm bridge connects, processes mock messages, sends input on user typing.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(renderer/terminal): xterm.js overlay attached to /ws/pane"
```

### Task 12.5: HookInstallModal + ReconnectModal

Similar TDD pattern.

### Task 12.6: EnvProbeBanner

Similar TDD pattern. Renders only when `tmux: false` or any required runtime missing.

### Task 12.7: TopBar integration

**Files:**
- Modify: `packages/renderer/src/shell/TopBar.tsx`
- Test: `packages/renderer/tests/shell/topBar.test.tsx`

- [ ] Inject the chip row + + button + banner. Confirm existing TopBar behaviors not regressed.

### Phase 12 — Buddy verification

Brief: "Verify Phase 12. The UI must render and the tests must actually click through interactions (state changes, modal opens, commands sent). Confirm no regressions in renderer tests. Write `planning/buddy-reviews/2026-05-23-tmux-orchestration-phase-12.md`."

---

## Phase 13 — Settings panels

### Task 13.1: RuntimesPanel + HookStatusPanel + EnvProbePanel

**Files:**
- Create three new panels under `packages/renderer/src/modals/settings/`
- Modify: `packages/renderer/src/modals/settings/SettingsModal.tsx` (add sections)
- RTL tests per panel

- [ ] **TDD pattern per panel.** RuntimesPanel: add/edit/remove with separate `executable` and `args[]` fields (no `command` field). HookStatusPanel: shows per-runtime status with "Show install instructions" buttons. EnvProbePanel: shows last probe + Re-probe button.

- [ ] **Commit per panel:**

```bash
git commit -m "feat(renderer/settings): manage runtimes panel"
git commit -m "feat(renderer/settings): hook status panel"
git commit -m "feat(renderer/settings): env probe panel"
```

### Phase 13 — Buddy verification

Brief: "Verify Phase 13. Confirm runtimes panel uses {executable, args[]} not a single command string (this was a buddy-flagged security issue). Confirm all three panels render via the SettingsModal. Write `planning/buddy-reviews/2026-05-23-tmux-orchestration-phase-13.md`."

---

## Phase 14 — Optional tmux smoke

### Task 14.1: tmux.smoke.test.ts

**Files:**
- Create: `packages/kernel/tests/smoke/tmux.smoke.test.ts`

- [ ] **Step 1: Write conditional test**

```typescript
import { describe, expect, it } from "vitest";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTmuxManager } from "../../src/tmux/manager.js";
import { realCommandRunner } from "../../src/tmux/commandRunner.js";

const execp = promisify(exec);

async function haveTmux(): Promise<boolean> {
  try {
    const { stdout } = await execp("tmux -V");
    return /tmux\s+([3-9]|[1-9][0-9])/.test(stdout);
  } catch { return false; }
}

describe.runIf(await haveTmux())("tmux smoke", () => {
  it("spawn → send literal → capture shows output → kill", async () => {
    const root = await mkdtemp(join(tmpdir(), "fmark-smoke-"));
    try {
      const mgr = createTmuxManager({ runner: realCommandRunner(), projectRoot: root });
      // Spawn a session running cat (echos stdin).
      const { sessionName } = await mgr.spawnAgent({
        participantId: "ag-smoke-1",
        executable: "cat",
        args: [],
      });
      try {
        await new Promise((r) => setTimeout(r, 200));
        await mgr.sendLiteralText(sessionName, "hello smoke");
        await mgr.sendKey(sessionName, "C-m");
        await new Promise((r) => setTimeout(r, 200));
        const snap = await mgr.captureSnapshot(sessionName);
        expect(snap).toMatch(/hello smoke/);
      } finally {
        await mgr.killSession(sessionName);
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Run**

```bash
pnpm --filter @f-mark/kernel test tests/smoke/tmux.smoke.test.ts
```

- On a machine with tmux 3.0+: PASS.
- Without tmux: SKIPPED.

- [ ] **Step 3: Commit**

```bash
git commit -m "test(kernel/smoke): optional tmux smoke test (skipped when tmux absent)"
```

### Phase 14 — Buddy verification

Brief: "Verify Phase 14. Confirm test is properly conditional (runs on tmux≥3.0 machines, skipped otherwise) and actually exercises real tmux (spawn → send-keys → capture-pane). Write `planning/buddy-reviews/2026-05-23-tmux-orchestration-phase-14.md`."

---

## Phase 15 — Docs + skill bundle updates

### Task 15.1: Update skill bundles + AGENT.md + README

**Files:**
- Modify: `packages/kernel/assets/claude-skill/f-mark/SKILL.md`
- Modify: `packages/kernel/assets/codex-skill/f-mark/SKILL.md`
- Modify: `packages/kernel/assets/gemini-skill/f-mark/SKILL.md`
- Modify: `packages/kernel/assets/AGENT.md`
- Modify: `README.md` (v0.4 features section)

- [ ] **Step 1: Add "Managed spawn" section** to each SKILL.md describing the new `+` button affordance for the user, and that hooks still need manual install (until v0.5).

- [ ] **Step 2: Update AGENT.md** to document the new `/agents/:id/ping` endpoint (called automatically by the auto-stream hook in v0.4+).

- [ ] **Step 3: Update README.md** with the new managed agents + terminal overlay capabilities.

- [ ] **Step 4: Commit**

```bash
git commit -m "docs: v0.4 managed agents + ping endpoint in skill bundles + AGENT.md + README"
```

---

## Phase 16 — Manual smoke pass

### Task 16.1: Per-runtime end-to-end test

**Files:**
- Create: `docs/superpowers/plans/2026-05-23-tmux-agent-orchestration-v04.manual-smoke.md`

The manual smoke checklist for the user to perform per release:

```markdown
# Manual smoke — v0.4 tmux agent orchestration

For each runtime (Claude Code, Codex, Gemini CLI), perform on a real dev machine with tmux 3.0+:

## Claude Code
- [ ] `npx f-mark` in a test project; open the UI; create a session.
- [ ] Top bar shows the env-probe banner if tmux/claude missing — install if needed.
- [ ] Click `+` → Claude. Pane spawns; tmux session created in detached mode.
- [ ] If hooks missing: Hook Install Modal appears with the snippet for `~/.claude/settings.json` + the right agent + user participant ids. Paste it.
- [ ] Open the terminal overlay for the new agent chip. Send a message via the agent menu's "Send a message…" — confirm Claude receives it and responds.
- [ ] Once Claude responds, presence dot flips green within ~15s.
- [ ] Try `/compact` from the menu (best effort). Confirm it sends.
- [ ] Try interrupt. Confirm Ctrl-C arrives.
- [ ] Kill the agent via "Say goodbye" (with confirmation). Pane is destroyed.
- [ ] Restart the kernel; the previous session is gone (because we killed it) — confirmed.
- [ ] Spawn another agent; this time `kill -9` the F-Mark kernel process (without "Say goodbye"). Tmux session should survive. Restart F-Mark; agent appears in `stale` then flips to `online` when the next hook ping arrives, OR stays `pane-dead` if the agent itself exited.

## Codex
- [ ] Same flow with `+` → Codex. Hook Install Modal shows `~/.codex/config.toml` snippet.
- [ ] First Codex run prompts the user to trust the hook command. Approve.
- [ ] Same lifecycle checks as Claude.
- [ ] **Known limitation:** Codex transcript parsing is preview-mode in v0.3.0; agent activity may appear partially. Confirm presence works regardless.

## Gemini CLI
- [ ] `+` → Gemini. Hook Install Modal shows "manual-stream mode — no hooks needed."
- [ ] In the spawned pane, run Gemini and have it perform a small task. It should manually POST prose + tool-use + turn-end via the existing v0.3.0 manual flow.
- [ ] Presence transitions: starts `stale` → flips `online` when first event arrives.

## Terminal
- [ ] `+` → Terminal. Plain shell spawns in the project dir.
- [ ] Manually launch `claude` inside this terminal. Hook ping fires; new agent participant appears in the chip row alongside the terminal.
- [ ] Verify the terminal pane and the agent are separately listed.
- [ ] Verify killing the terminal also ends the spawned-in agent (or shows it as `pane-dead`).

## Pane WS fan-out
- [ ] Open the terminal overlay for one agent. Open it AGAIN in a different browser tab/window pointed at the same kernel. Both windows see live output. Type in one; the other sees the keystrokes.
- [ ] Close one window. The other continues working.

## Reconcile
- [ ] Spawn 2 managed agents + 1 terminal.
- [ ] `kill -9` the kernel process.
- [ ] Confirm the 3 tmux sessions are still running (`tmux ls`).
- [ ] Restart F-Mark. The chip row reappears with the 3 entries.
- [ ] Confirm `@fmark-project` is verified (tmux session list shows the user options).
```

- [ ] **Step 1: Commit**

```bash
git add docs/superpowers/plans/2026-05-23-tmux-agent-orchestration-v04.manual-smoke.md
git commit -m "docs(smoke): v0.4 manual smoke checklist per runtime"
```

- [ ] **Step 2: Execute the checklist.** Record findings in `planning/v0.4-smoke-findings.md` and address any failures by opening fix tasks before declaring v0.4 done.

### Phase 16 — Buddy verification

Brief: "Verify Phase 16. Confirm the manual smoke document exists and is comprehensive across the three runtimes. Confirm the smoke was actually executed (look at planning/v0.4-smoke-findings.md, not just the checklist file). If smoke wasn't executed end-to-end, FAIL the phase. Write `planning/buddy-reviews/2026-05-23-tmux-orchestration-phase-16.md`."

---

## Final integration verification

After all phases:

- [ ] **Full kernel suite:** `pnpm --filter @f-mark/kernel test` → green.
- [ ] **Full renderer suite:** `pnpm --filter @f-mark/renderer test` → green.
- [ ] **Build:** `pnpm -r build` → green.
- [ ] **Tmux smoke (if available):** `pnpm --filter @f-mark/kernel test tests/smoke/` → green.
- [ ] **Manual smoke checklist:** completed and recorded.
- [ ] **Bump version to 0.4.0:** `package.json` + each package.json.
- [ ] **Final commit + tag:**

```bash
git add package.json packages/*/package.json
git commit -m "chore: 0.4.0 — tmux agent orchestration"
git tag v0.4.0
```

- [ ] **Final /buddy review of the integrated feature** — full-scope check, not phase-by-phase. Brief:

> Review the integrated v0.4 feature. Read the spec, the manual smoke findings, the per-phase buddy reviews, and the current state of the repo. Verify: (a) v0.3.0 auto-stream still works (look at the existing test suite + manual smoke for Claude), (b) all 16 phases were genuinely completed (look at commit log + per-phase buddy approval files), (c) the spec's non-goals were actually respected (no supervisor daemon, no token telemetry, no auto hook installer, no env package installer), (d) all three runtimes were exercised end-to-end. If anything is missing, list it. Write `planning/buddy-reviews/2026-05-23-tmux-orchestration-final.md`.

If the final buddy reports clean → v0.4 ships.
If issues found → triage and fix in follow-up commits before declaring done.

---

## Notes on execution

**For subagents executing this plan:**

- Read the spec (`docs/superpowers/specs/2026-05-23-tmux-agent-orchestration-design.md`) and the buddy review (`planning/buddy-reviews/2026-05-23-tmux-orchestration-review.md`) before starting your task.
- One task at a time. Strict TDD: failing test first, implementation, passing test, commit.
- Never run `pnpm -r build` between every task — only at phase boundaries unless type errors are blocking.
- When a code snippet references a function that doesn't exist yet in this plan, look for it in an earlier task. If not present, surface the gap to the orchestrator rather than inventing.
- Tests should test behavior, not implementation. If a refactor breaks a test that was overfit, fix the test by widening its scope rather than rolling back the refactor.
- `/buddy` verification after each phase is independent. Do not approve your own work.
