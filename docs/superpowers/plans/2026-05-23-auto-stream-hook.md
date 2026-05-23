# Auto-Stream Hook & Expandable Mid-Turn Grouping — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace agent-driven prose POSTs with a hook that auto-streams every assistant turn into F-Mark; introduce `tool-use` as a first-class event kind and `arbitrary` as a prose flag; render consecutive mid-turn events as an expandable group that auto-closes when the conclusion arrives. Ship across Claude Code, Codex, and Gemini.

**Architecture:**
- **Schema:** `tool-use` becomes a new `EventKind`; prose gains an optional `arbitrary: boolean` frontmatter field (defaults to false). Stored as JSON and Markdown event files respectively, following existing conventions.
- **Kernel:** new `POST /sessions/:id/events/tool-use` route, new `POST /agents/:participant_id/link` route that writes `.f-mark/agents/<id>/active-session` (the disk pointer the hook reads), and a new `f-mark hook auto-stream <participant_id>` CLI subcommand that parses Claude Code's stdin payload, walks the JSONL transcript, and POSTs the ordered turn slice as a mix of `tool-use` events + `arbitrary` and concluding `prose` events.
- **Renderer:** new `ToolUseCard` rendering an icon + expandable input/output; new `ArbitraryGroupCard` that wraps a run of consecutive same-participant mid-turn events into a collapsible box (open while no concluding prose exists yet, auto-closed once it arrives, title shows time-range + tool count).
- **Per-agent skills:** Claude Code (Stop + UserPromptSubmit hooks → settings.json), Codex (config.toml hooks, format confirmed at start of phase 7), Gemini CLI (hook capability confirmed at start of phase 8; fallback path documented if absent). The shell command is identical across runtimes; only the registration format differs.

**Tech Stack:** TypeScript (kernel + renderer + shared), React 18, Vitest, Fastify, Zustand, gray-matter, Node 18+ built-in fetch.

---

## Decisions & Defaults

These choices are baked into the tasks below. Override the plan before execution if any are wrong.

1. **Hook implementation as a kernel CLI subcommand**, not a bash+jq script. Reasons: directly Vitest-testable, no `jq` dependency on user's machine, ships with the package, updates with version. Settings entries invoke `npx -y f-mark hook auto-stream <participant_id>`.
2. **`arbitrary` defaults to `false`** (omitted in frontmatter when false) — matches today's behavior where every prose is deliberate. Older sessions remain valid.
3. **Active session pointer lives at `.f-mark/agents/<participant_id>/active-session`** — per-agent so two agents can link to different sessions. The file's only content is the session ID.
4. **`tool-use` filenames use hyphen**: `20260523T143012Z_ag-claude.tool-use.json`. The kind regex in `composeFilename` accepts hyphens; we add a test to lock that in.
5. **Mid-turn vs concluding split:** within a single assistant turn (everything since the last user-typed prompt), every text block *except the final one* is posted as `arbitrary=true`; the final text block is `arbitrary=false`. Tool-use blocks are emitted as `tool-use` events in order. If a turn has no final text block (e.g., last action was a tool call with no follow-up text), no `arbitrary=false` prose is posted — the group remains "open" until a future Stop fires with concluding text.
6. **Tool-result pairing:** when emitting a `tool-use` event, the corresponding tool_result (paired by `tool_use_id`, found in the subsequent synthesized user message) is included in the same event payload.
7. **Noise filter (initial pass):** drop text blocks where `text.trim() === ""`. Drop entire Stop firings where the turn produced zero events post-filter. Do **not** drop "narration" text (e.g., "I'll search for X") — those are exactly what the arbitrary group is for.
8. **Codex/Gemini fallback:** if a runtime lacks Stop-equivalent hooks, the skill instructs the model to manually POST mid-turn narration with `arbitrary=true`. The renderer behavior is identical either way.
9. **Idempotency:** Stop hooks can re-fire with `stop_hook_active=true` if the assistant continues itself. The hook command short-circuits when that flag is set.
10. **Tests:** Vitest in the kernel + renderer packages. We follow the existing convention (`tests/` next to `src/`, suffix `.test.ts`). Pure functions are extracted from the CLI command for direct unit testing; the CLI shell is integration-tested with `fetch` mocked.

---

## File Structure

**New files:**
- `packages/shared/src/events.ts` (modified) — add `tool-use` kind, `ToolUsePayload`, `arbitrary` on `ProseFrontmatter`
- `packages/kernel/src/events/toolUse.ts` — serialize/parse
- `packages/kernel/src/events/prose.ts` (modified) — handle `arbitrary` round-trip
- `packages/kernel/src/routes/events.ts` (modified) — POST /events/tool-use, accept `arbitrary` on prose
- `packages/kernel/src/routes/agents.ts` (new) — POST /agents/:id/link
- `packages/kernel/src/agents/activeSession.ts` — read/write active-session pointer
- `packages/kernel/src/hooks/autoStream.ts` — CLI handler + pure helpers
- `packages/kernel/src/hooks/transcript.ts` — JSONL parsing pure functions
- `packages/kernel/src/cli.ts` (modified) — register `hook auto-stream` subcommand
- `packages/renderer/src/cards/ToolUseCard.tsx` — tool-use renderer
- `packages/renderer/src/cards/ArbitraryGroupCard.tsx` — expandable group
- `packages/renderer/src/cards/EventCard.tsx` (modified) — dispatch new kinds
- `packages/renderer/src/feed/projectFeed.ts` — group projection function
- `packages/renderer/src/feed/toolIcons.ts` — name → icon map
- `packages/kernel/assets/claude-skill/f-mark/SKILL.md` (modified) — new link + hook-install flow
- `packages/kernel/assets/claude-skill/f-mark/api.md` (modified) — document new endpoints
- `packages/kernel/assets/codex-skill/f-mark/SKILL.md` (new)
- `packages/kernel/assets/codex-skill/f-mark/api.md` (new)
- `packages/kernel/assets/gemini-skill/f-mark/SKILL.md` (new)
- `packages/kernel/assets/gemini-skill/f-mark/api.md` (new)
- `packages/kernel/assets/AGENT.md` (modified) — describe link flow + arbitrary semantics
- Tests next to each new src file: `*.test.ts` / `*.test.tsx`

**Modified files (summary):**
- `packages/shared/src/events.ts:1-114`
- `packages/kernel/src/routes/events.ts:1-295`
- `packages/kernel/src/events/writer.ts:56-61` (kind regex may need a test)
- `packages/kernel/src/server.ts` (register agents route)
- `packages/kernel/src/cli.ts`
- `packages/renderer/src/cards/EventCard.tsx:1-82`
- `packages/renderer/src/state/store.ts` (feed projection wiring)

---

## Phase 1 — Schema additions (shared)

### Task 1: Add `tool-use` event kind to shared types

**Files:**
- Modify: `packages/shared/src/events.ts:1-114`
- Test: `packages/shared/src/events.test.ts` (create if missing; check whether shared has tests — if not, fold these into `packages/kernel/tests/events/toolUse.test.ts`)

- [ ] **Step 1: Write failing test for tool-use payload type**

Create `packages/kernel/tests/events/toolUse-types.test.ts`:

```typescript
import { describe, it, expectTypeOf } from "vitest";
import type {
  ToolUsePayload,
  ToolUseEventRecord,
  AnyEventRecord,
  EventKind,
} from "@f-mark/shared/events";

describe("tool-use event types", () => {
  it("ToolUsePayload has the expected shape", () => {
    const p: ToolUsePayload = {
      tool_name: "Bash",
      tool_use_id: "tu_abc",
      input: { command: "ls" },
      result: "file1\nfile2",
      success: true,
      duration_ms: 12,
    };
    expectTypeOf(p.tool_name).toEqualTypeOf<string>();
    expectTypeOf(p.input).toEqualTypeOf<unknown>();
  });

  it("AnyEventRecord includes ToolUseEventRecord", () => {
    const rec: AnyEventRecord = {
      filename: "20260523T100000Z_ag-claude.tool-use.json",
      timestamp: "20260523T100000Z",
      participant_id: "ag-claude",
      kind: "tool-use",
      payload: {
        tool_name: "Bash",
        tool_use_id: "tu_abc",
        input: {},
        success: true,
      },
    } satisfies ToolUseEventRecord;
    expectTypeOf<typeof rec>().toMatchTypeOf<AnyEventRecord>();
  });

  it('"tool-use" is a member of EventKind', () => {
    const k: EventKind = "tool-use";
    expectTypeOf(k).toEqualTypeOf<EventKind>();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @f-mark/kernel test tests/events/toolUse-types.test.ts`
Expected: FAIL with "Property 'ToolUsePayload' does not exist" / "Type 'tool-use' is not assignable to EventKind".

- [ ] **Step 3: Add types to shared events**

Edit `packages/shared/src/events.ts`. Find:

```typescript
export type EventKind = "prose" | "choices" | "choice" | "turn-end" | "todo" | "html" | "file";
```

Change to:

```typescript
export type EventKind = "prose" | "choices" | "choice" | "turn-end" | "todo" | "html" | "file" | "tool-use";
```

Add (after the existing `ProsePayload` block, before the discriminated union):

```typescript
export interface ToolUsePayload {
  tool_name: string;          // e.g. "Bash", "Read", "Edit"
  tool_use_id: string;        // from the runtime transcript (Claude tool_use.id, Codex equiv.)
  input: unknown;             // JSON-serialisable arguments
  result?: unknown;           // tool_result content (string or structured)
  success: boolean;           // false when the runtime reports tool error / is_error
  duration_ms?: number;       // optional latency if the runtime exposes it
}

export interface ToolUseEventRecord {
  filename: string;
  timestamp: string;
  participant_id: string;
  kind: "tool-use";
  payload: ToolUsePayload;
}
```

Then extend the `AnyEventRecord` union:

```typescript
export type AnyEventRecord =
  | ProseEventRecord
  | ChoicesEventRecord
  | ChoiceEventRecord
  | TurnEndEventRecord
  | TodoEventRecord
  | FileEventRecord
  | HtmlEventRecord
  | ToolUseEventRecord
  | EventRecord;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @f-mark/kernel test tests/events/toolUse-types.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/events.ts packages/kernel/tests/events/toolUse-types.test.ts
git commit -m "feat(shared): add tool-use event kind to the discriminated union"
```

---

### Task 2: Add `arbitrary` flag to ProseFrontmatter

**Files:**
- Modify: `packages/shared/src/events.ts` (ProseFrontmatter)
- Modify: `packages/kernel/src/events/prose.ts:1-30`
- Test: `packages/kernel/tests/events/prose.test.ts` (existing)

- [ ] **Step 1: Write failing tests for `arbitrary` round-trip**

Append to `packages/kernel/tests/events/prose.test.ts`:

```typescript
import { serializeProse, parseProse } from "../../src/events/prose";

describe("prose `arbitrary` flag", () => {
  it("serialises with arbitrary: true in frontmatter when set", () => {
    const out = serializeProse({ content: "thinking out loud", arbitrary: true });
    expect(out.startsWith("---\n")).toBe(true);
    expect(out).toContain("arbitrary: true");
    expect(out).toContain("\nthinking out loud");
  });

  it("omits arbitrary from frontmatter when false (default semantics)", () => {
    const out = serializeProse({ content: "deliberate", arbitrary: false });
    expect(out).toBe("deliberate"); // no frontmatter at all
  });

  it("omits arbitrary from frontmatter when undefined", () => {
    const out = serializeProse({ content: "deliberate" });
    expect(out).toBe("deliberate");
  });

  it("parses arbitrary back as boolean", () => {
    const md = "---\narbitrary: true\n---\nbody";
    expect(parseProse(md)).toEqual({ content: "body", arbitrary: true });
  });

  it("parses missing arbitrary as undefined (not false)", () => {
    expect(parseProse("plain")).toEqual({ content: "plain" });
  });

  it("coexists with name and target", () => {
    const out = serializeProse({
      content: "midstream comment",
      name: "Draft",
      arbitrary: true,
    });
    expect(out).toContain("name: Draft");
    expect(out).toContain("arbitrary: true");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @f-mark/kernel test tests/events/prose.test.ts`
Expected: FAIL — `arbitrary` field is not in the type, serializer ignores it.

- [ ] **Step 3: Extend ProseFrontmatter**

Edit `packages/shared/src/events.ts`. Find:

```typescript
export interface ProseFrontmatter {
  name?: string;
  target?: ProseTarget;
  in_reply_to?: string;
  supersedes?: string;
}
```

Change to:

```typescript
export interface ProseFrontmatter {
  name?: string;
  target?: ProseTarget;
  in_reply_to?: string;
  supersedes?: string;
  /**
   * When true, marks the prose as mid-turn / non-deliberate output streamed by a hook.
   * The renderer groups consecutive `arbitrary: true` events into a collapsible box.
   * Omitted from frontmatter when undefined or false.
   */
  arbitrary?: boolean;
}
```

- [ ] **Step 4: Update serializer/parser**

Open `packages/kernel/src/events/prose.ts`. The current `serializeProse` builds a frontmatter object. Add `arbitrary` to the picked keys, but only when truthy:

```typescript
import matter from "gray-matter";
import type { ProsePayload, ProseFrontmatter } from "@f-mark/shared/events";

export function serializeProse(payload: ProsePayload): string {
  const fm: ProseFrontmatter = {};
  if (payload.name) fm.name = payload.name;
  if (payload.target) fm.target = payload.target;
  if (payload.in_reply_to) fm.in_reply_to = payload.in_reply_to;
  if (payload.supersedes) fm.supersedes = payload.supersedes;
  if (payload.arbitrary === true) fm.arbitrary = true;

  const hasFrontmatter = Object.keys(fm).length > 0;
  if (!hasFrontmatter) return payload.content;
  return matter.stringify(payload.content, fm);
}

export function parseProse(raw: string): ProsePayload {
  const { content, data } = matter(raw);
  const payload: ProsePayload = { content };
  if (typeof data.name === "string") payload.name = data.name;
  if (data.target && typeof data.target === "object") payload.target = data.target;
  if (typeof data.in_reply_to === "string") payload.in_reply_to = data.in_reply_to;
  if (typeof data.supersedes === "string") payload.supersedes = data.supersedes;
  if (data.arbitrary === true) payload.arbitrary = true;
  return payload;
}
```

(Adjust to match the actual structure already in the file — preserve existing imports/helpers.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @f-mark/kernel test tests/events/prose.test.ts`
Expected: PASS (including new and original tests).

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/events.ts packages/kernel/src/events/prose.ts packages/kernel/tests/events/prose.test.ts
git commit -m "feat(shared): add arbitrary flag to prose frontmatter"
```

---

### Task 3: tool-use serializer (JSON event)

**Files:**
- Create: `packages/kernel/src/events/toolUse.ts`
- Create: `packages/kernel/tests/events/toolUse.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/kernel/tests/events/toolUse.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { serializeToolUse, parseToolUse } from "../../src/events/toolUse";
import type { ToolUsePayload } from "@f-mark/shared/events";

describe("toolUse serialize/parse", () => {
  const sample: ToolUsePayload = {
    tool_name: "Bash",
    tool_use_id: "tu_01HABC",
    input: { command: "ls -la" },
    result: "total 0\n",
    success: true,
    duration_ms: 14,
  };

  it("round-trips a fully populated payload", () => {
    const raw = serializeToolUse(sample);
    expect(JSON.parse(raw)).toEqual(sample);
    expect(parseToolUse(raw)).toEqual(sample);
  });

  it("rejects payload missing tool_name on parse", () => {
    expect(() => parseToolUse(JSON.stringify({ tool_use_id: "x", input: {}, success: true }))).toThrow();
  });

  it("preserves structured (non-string) result", () => {
    const p: ToolUsePayload = {
      tool_name: "Read",
      tool_use_id: "tu_2",
      input: { file_path: "/a.txt" },
      result: { lines: ["a", "b"] },
      success: true,
    };
    expect(parseToolUse(serializeToolUse(p))).toEqual(p);
  });

  it("treats success=false as preserved", () => {
    const p: ToolUsePayload = {
      tool_name: "Edit",
      tool_use_id: "tu_3",
      input: {},
      result: "permission denied",
      success: false,
    };
    expect(parseToolUse(serializeToolUse(p))).toEqual(p);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @f-mark/kernel test tests/events/toolUse.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement serializer/parser**

Create `packages/kernel/src/events/toolUse.ts`:

```typescript
import type { ToolUsePayload } from "@f-mark/shared/events";

export function serializeToolUse(payload: ToolUsePayload): string {
  return JSON.stringify(payload, null, 2);
}

export function parseToolUse(raw: string): ToolUsePayload {
  const data = JSON.parse(raw) as Partial<ToolUsePayload>;
  if (typeof data.tool_name !== "string" || data.tool_name.length === 0) {
    throw new Error("tool-use payload missing tool_name");
  }
  if (typeof data.tool_use_id !== "string" || data.tool_use_id.length === 0) {
    throw new Error("tool-use payload missing tool_use_id");
  }
  if (typeof data.success !== "boolean") {
    throw new Error("tool-use payload missing success");
  }
  return {
    tool_name: data.tool_name,
    tool_use_id: data.tool_use_id,
    input: data.input ?? {},
    result: data.result,
    success: data.success,
    duration_ms: typeof data.duration_ms === "number" ? data.duration_ms : undefined,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @f-mark/kernel test tests/events/toolUse.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/kernel/src/events/toolUse.ts packages/kernel/tests/events/toolUse.test.ts
git commit -m "feat(kernel): tool-use event serializer + parser"
```

---

### Task 4: Filename regex allows hyphenated kind

**Files:**
- Read first: `packages/kernel/src/events/writer.ts` (and the `composeFilename` helper, wherever it lives — likely shared)
- Test: `packages/kernel/tests/events/writer.test.ts` (existing)

- [ ] **Step 1: Write failing test for hyphenated kind**

Append to `packages/kernel/tests/events/writer.test.ts`:

```typescript
import { composeFilename } from "../../src/events/writer";

describe("composeFilename with hyphenated kinds", () => {
  it("produces a tool-use filename", () => {
    const name = composeFilename({
      timestamp: "20260523T100000Z",
      participant_id: "ag-claude",
      kind: "tool-use",
      ext: "json",
    });
    expect(name).toBe("20260523T100000Z_ag-claude.tool-use.json");
  });

  it("round-trips through the existing parse helper", () => {
    // If a parseFilename helper exists in the same module, assert it can split tool-use correctly.
    // Adjust import path if necessary; if no parser exists, delete this `it`.
  });
});
```

- [ ] **Step 2: Run test to verify it fails or passes**

Run: `pnpm --filter @f-mark/kernel test tests/events/writer.test.ts`

If it passes, the regex already supports hyphens — skip steps 3–4 and commit only the test as a guard.
If it fails (likely if there's an `EventKind` validation that uses an allow-list), update the validator to include `tool-use`.

- [ ] **Step 3: If failing, locate the validator**

Run: `grep -n "tool-use\|EventKind\b\|kind\s*[:=]" packages/kernel/src/events/writer.ts`

Update the kind allow-list or regex to include `tool-use`. Don't relax the regex to allow arbitrary kinds — explicitly add `"tool-use"` to whatever set governs validation.

- [ ] **Step 4: Re-run tests**

Run: `pnpm --filter @f-mark/kernel test tests/events/writer.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/kernel/src/events/writer.ts packages/kernel/tests/events/writer.test.ts
git commit -m "feat(kernel): allow tool-use kind in filename composition"
```

---

## Phase 2 — Kernel routes & active-session pointer

### Task 5: POST /sessions/:id/events/tool-use

**Files:**
- Modify: `packages/kernel/src/routes/events.ts` (add handler near the existing prose handler at line 58)
- Test: `packages/kernel/tests/routes/events.test.ts` (existing)

- [ ] **Step 1: Write failing integration test**

Append to `packages/kernel/tests/routes/events.test.ts`:

```typescript
describe("POST /sessions/:id/events/tool-use", () => {
  it("writes a tool-use event file and broadcasts", async () => {
    const { app, dir, sessionId } = await bootKernel(); // use the existing test harness
    const res = await app.inject({
      method: "POST",
      url: `/sessions/${sessionId}/events/tool-use`,
      headers: { authorization: `Bearer ${app.config.token}` },
      payload: {
        participant_id: "ag-claude",
        tool_name: "Bash",
        tool_use_id: "tu_01",
        input: { command: "ls" },
        result: "a\nb\n",
        success: true,
        duration_ms: 12,
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.filename).toMatch(/\d{8}T\d{6}Z_ag-claude\.tool-use\.json$/);
    expect(body.kind).toBe("tool-use");

    // file exists on disk and round-trips
    const onDisk = await readEventFile(dir, sessionId, body.filename);
    expect(JSON.parse(onDisk)).toMatchObject({ tool_name: "Bash", success: true });
  });

  it("400s on missing tool_name", async () => {
    const { app, sessionId } = await bootKernel();
    const res = await app.inject({
      method: "POST",
      url: `/sessions/${sessionId}/events/tool-use`,
      headers: { authorization: `Bearer ${app.config.token}` },
      payload: { participant_id: "ag-claude", input: {}, success: true },
    });
    expect(res.statusCode).toBe(400);
  });

  it("401s without bearer", async () => {
    const { app, sessionId } = await bootKernel();
    const res = await app.inject({
      method: "POST",
      url: `/sessions/${sessionId}/events/tool-use`,
      payload: { participant_id: "ag-claude", tool_name: "x", tool_use_id: "y", input: {}, success: true },
    });
    expect(res.statusCode).toBe(401);
  });
});
```

(Use the existing `bootKernel` / `readEventFile` helpers — if their names differ, mirror what's used in adjacent tests in the same file.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @f-mark/kernel test tests/routes/events.test.ts -t "tool-use"`
Expected: FAIL — 404 from the kernel because the route doesn't exist.

- [ ] **Step 3: Implement the route**

In `packages/kernel/src/routes/events.ts`, mirror the existing prose handler (lines 58–120). Add (after the prose route, before `choices`):

```typescript
app.post<{
  Params: { id: string };
  Body: {
    participant_id: string;
    tool_name: string;
    tool_use_id: string;
    input: unknown;
    result?: unknown;
    success: boolean;
    duration_ms?: number;
  };
}>(
  "/sessions/:id/events/tool-use",
  {
    schema: {
      body: {
        type: "object",
        required: ["participant_id", "tool_name", "tool_use_id", "success"],
        properties: {
          participant_id: { type: "string", minLength: 1 },
          tool_name: { type: "string", minLength: 1 },
          tool_use_id: { type: "string", minLength: 1 },
          input: {},
          result: {},
          success: { type: "boolean" },
          duration_ms: { type: "number" },
        },
      },
    },
  },
  async (req) => {
    const filename = await writeEventFile(p, req.params.id, {
      participant_id: req.body.participant_id,
      kind: "tool-use",
      ext: "json",
      contents: serializeToolUse({
        tool_name: req.body.tool_name,
        tool_use_id: req.body.tool_use_id,
        input: req.body.input ?? {},
        result: req.body.result,
        success: req.body.success,
        duration_ms: req.body.duration_ms,
      }),
    });
    const timestamp = filename.split("_")[0];
    publish(req.params.id, filename, "tool-use", req.body.participant_id);
    return { filename, timestamp, participant_id: req.body.participant_id, kind: "tool-use" };
  },
);
```

Import `serializeToolUse` from `../events/toolUse`.

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @f-mark/kernel test tests/routes/events.test.ts`
Expected: PASS — all tool-use tests + existing prose tests still green.

- [ ] **Step 5: Commit**

```bash
git add packages/kernel/src/routes/events.ts packages/kernel/tests/routes/events.test.ts
git commit -m "feat(kernel): POST /sessions/:id/events/tool-use"
```

---

### Task 6: Accept `arbitrary` on POST /events/prose

**Files:**
- Modify: `packages/kernel/src/routes/events.ts:58-120` (prose route)
- Modify: `packages/kernel/tests/routes/events.test.ts`

- [ ] **Step 1: Write failing test**

Append to `packages/kernel/tests/routes/events.test.ts`:

```typescript
describe("POST /sessions/:id/events/prose with arbitrary", () => {
  it("stores arbitrary: true in frontmatter when sent", async () => {
    const { app, dir, sessionId } = await bootKernel();
    const res = await app.inject({
      method: "POST",
      url: `/sessions/${sessionId}/events/prose`,
      headers: { authorization: `Bearer ${app.config.token}` },
      payload: { participant_id: "ag-claude", content: "thinking", arbitrary: true },
    });
    expect(res.statusCode).toBe(200);
    const md = await readEventFile(dir, sessionId, res.json().filename);
    expect(md).toContain("arbitrary: true");
    expect(md).toContain("\nthinking");
  });

  it("does not write arbitrary key when false/omitted", async () => {
    const { app, dir, sessionId } = await bootKernel();
    const res = await app.inject({
      method: "POST",
      url: `/sessions/${sessionId}/events/prose`,
      headers: { authorization: `Bearer ${app.config.token}` },
      payload: { participant_id: "ag-claude", content: "deliberate" },
    });
    const md = await readEventFile(dir, sessionId, res.json().filename);
    expect(md).not.toContain("arbitrary");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @f-mark/kernel test tests/routes/events.test.ts -t "arbitrary"`
Expected: FAIL — schema rejects unknown property, OR field is silently dropped.

- [ ] **Step 3: Extend prose route schema**

In `packages/kernel/src/routes/events.ts` at the prose handler, add `arbitrary` to the body schema:

```typescript
properties: {
  participant_id: { type: "string", minLength: 1 },
  content: { type: "string" },
  name: { type: "string" },
  target: { type: "object" /* existing shape */ },
  in_reply_to: { type: "string" },
  supersedes: { type: "string" },
  arbitrary: { type: "boolean" },
},
```

And ensure `arbitrary` is forwarded into the `serializeProse` call. The serializer (Task 2) already handles the field.

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @f-mark/kernel test tests/routes/events.test.ts`
Expected: PASS — both arbitrary cases + existing prose tests.

- [ ] **Step 5: Commit**

```bash
git add packages/kernel/src/routes/events.ts packages/kernel/tests/routes/events.test.ts
git commit -m "feat(kernel): accept arbitrary flag on POST /events/prose"
```

---

### Task 7: Active-session pointer helpers

**Files:**
- Create: `packages/kernel/src/agents/activeSession.ts`
- Create: `packages/kernel/tests/agents/activeSession.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/kernel/tests/agents/activeSession.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import {
  writeActiveSession,
  readActiveSession,
  activeSessionPath,
} from "../../src/agents/activeSession";

describe("active-session pointer", () => {
  let dir: string;
  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), "fm-")); });

  it("writes <fmark>/agents/<id>/active-session containing the session id", async () => {
    await writeActiveSession(dir, "ag-claude", "2026-05-23-spike");
    expect(await readActiveSession(dir, "ag-claude")).toBe("2026-05-23-spike");
  });

  it("returns null when no pointer exists", async () => {
    expect(await readActiveSession(dir, "ag-claude")).toBeNull();
  });

  it("activeSessionPath is deterministic", () => {
    expect(activeSessionPath(dir, "ag-claude"))
      .toBe(join(dir, "agents", "ag-claude", "active-session"));
  });

  it("overwrites previous pointer atomically (no partial reads)", async () => {
    await writeActiveSession(dir, "ag-claude", "session-a");
    await writeActiveSession(dir, "ag-claude", "session-b");
    expect(await readActiveSession(dir, "ag-claude")).toBe("session-b");
  });

  it("rejects participant_id with path traversal", async () => {
    await expect(writeActiveSession(dir, "../etc", "x")).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @f-mark/kernel test tests/agents/activeSession.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `packages/kernel/src/agents/activeSession.ts`:

```typescript
import { mkdir, readFile, rename, writeFile } from "fs/promises";
import { dirname, join } from "path";

const PARTICIPANT_RE = /^[a-z][a-z0-9-]{0,63}$/;

function assertValidParticipant(id: string): void {
  if (!PARTICIPANT_RE.test(id)) {
    throw new Error(`invalid participant_id: ${id}`);
  }
}

export function activeSessionPath(fmarkDir: string, participantId: string): string {
  assertValidParticipant(participantId);
  return join(fmarkDir, "agents", participantId, "active-session");
}

export async function writeActiveSession(
  fmarkDir: string,
  participantId: string,
  sessionId: string,
): Promise<void> {
  const target = activeSessionPath(fmarkDir, participantId);
  await mkdir(dirname(target), { recursive: true });
  const tmp = `${target}.tmp`;
  await writeFile(tmp, sessionId, "utf8");
  await rename(tmp, target); // atomic on POSIX
}

export async function readActiveSession(
  fmarkDir: string,
  participantId: string,
): Promise<string | null> {
  try {
    const txt = await readFile(activeSessionPath(fmarkDir, participantId), "utf8");
    return txt.trim() || null;
  } catch (err: any) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @f-mark/kernel test tests/agents/activeSession.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/kernel/src/agents/activeSession.ts packages/kernel/tests/agents/activeSession.test.ts
git commit -m "feat(kernel): per-agent active-session pointer helpers"
```

---

### Task 8: POST /agents/:id/link endpoint

**Files:**
- Create: `packages/kernel/src/routes/agents.ts`
- Modify: `packages/kernel/src/server.ts` (register the new route)
- Create: `packages/kernel/tests/routes/agents.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/kernel/tests/routes/agents.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { bootKernel } from "../helpers/bootKernel";
import { readActiveSession } from "../../src/agents/activeSession";

describe("POST /agents/:id/link", () => {
  it("writes the active-session pointer and returns session metadata", async () => {
    const { app, dir, sessionId } = await bootKernel();
    const res = await app.inject({
      method: "POST",
      url: "/agents/ag-claude/link",
      headers: { authorization: `Bearer ${app.config.token}` },
      payload: { session_id: sessionId },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ participant_id: "ag-claude", session_id: sessionId });
    expect(await readActiveSession(dir, "ag-claude")).toBe(sessionId);
  });

  it("404s on unknown session", async () => {
    const { app } = await bootKernel();
    const res = await app.inject({
      method: "POST",
      url: "/agents/ag-claude/link",
      headers: { authorization: `Bearer ${app.config.token}` },
      payload: { session_id: "definitely-not-real" },
    });
    expect(res.statusCode).toBe(404);
  });

  it("400s on invalid participant_id", async () => {
    const { app, sessionId } = await bootKernel();
    const res = await app.inject({
      method: "POST",
      url: "/agents/..%2Fetc/link",
      headers: { authorization: `Bearer ${app.config.token}` },
      payload: { session_id: sessionId },
    });
    expect(res.statusCode).toBe(400);
  });

  it("401s without bearer", async () => {
    const { app, sessionId } = await bootKernel();
    const res = await app.inject({
      method: "POST",
      url: "/agents/ag-claude/link",
      payload: { session_id: sessionId },
    });
    expect(res.statusCode).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @f-mark/kernel test tests/routes/agents.test.ts`
Expected: FAIL — 404 (route absent).

- [ ] **Step 3: Implement route**

Create `packages/kernel/src/routes/agents.ts`:

```typescript
import type { FastifyInstance } from "fastify";
import { writeActiveSession } from "../agents/activeSession";
import { sessionExists } from "../sessions/registry"; // use whatever helper already lists/validates sessions

const PARTICIPANT_RE = /^[a-z][a-z0-9-]{0,63}$/;

export function registerAgentsRoutes(app: FastifyInstance, fmarkDir: string) {
  app.post<{
    Params: { id: string };
    Body: { session_id: string };
  }>(
    "/agents/:id/link",
    {
      schema: {
        body: {
          type: "object",
          required: ["session_id"],
          properties: { session_id: { type: "string", minLength: 1 } },
        },
      },
    },
    async (req, reply) => {
      const participantId = decodeURIComponent(req.params.id);
      if (!PARTICIPANT_RE.test(participantId)) {
        return reply.code(400).send({ error: "invalid participant_id" });
      }
      if (!(await sessionExists(fmarkDir, req.body.session_id))) {
        return reply.code(404).send({ error: "session not found" });
      }
      await writeActiveSession(fmarkDir, participantId, req.body.session_id);
      return { participant_id: participantId, session_id: req.body.session_id };
    },
  );
}
```

(If `sessionExists` doesn't exist, inline the check by stating whether `fmarkDir/sessions/<id>` is a directory.)

- [ ] **Step 4: Register in server**

In `packages/kernel/src/server.ts`, alongside the other `register*` calls:

```typescript
import { registerAgentsRoutes } from "./routes/agents";
// ...
registerAgentsRoutes(app, fmarkDir);
```

- [ ] **Step 5: Run tests**

Run: `pnpm --filter @f-mark/kernel test tests/routes/agents.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/kernel/src/routes/agents.ts packages/kernel/src/server.ts packages/kernel/tests/routes/agents.test.ts
git commit -m "feat(kernel): POST /agents/:id/link writes active-session pointer"
```

---

## Phase 3 — Auto-stream CLI command

The hook command is the only piece that does real work per turn. It is invoked as:

```
npx -y f-mark hook auto-stream <participant_id> [--kind assistant|user]
```

Stdin: the Claude-Code-style hook JSON payload (`{ session_id, transcript_path, cwd, hook_event_name, stop_hook_active, ... }`).

Behavior (assistant kind):
1. Read stdin → JSON.
2. If `stop_hook_active === true`, exit 0 silently.
3. Resolve `.f-mark/` from `cwd` (walk upward until found, error if missing).
4. Read `.f-mark/.token`, `.f-mark/config.json` → kernel URL.
5. Read `.f-mark/agents/<participant_id>/active-session` → session id. If absent, exit 0 with stderr warning (we'd be silently posting to nowhere).
6. Read transcript JSONL. Walk **back** from the end of the file, collect contiguous assistant entries, **stop at the first message whose role is `user` and whose content does not contain only `tool_result` blocks** (i.e., the genuine user prompt).
7. From those assistant entries, flatten content blocks in original order: `text`, `tool_use`, `text`, `tool_use`, `text`. Tool results are pulled from the synthesized user messages (matched by `tool_use_id`).
8. Run the noise filter (drop empty text blocks).
9. Decide the final block: if the last block in order is `text`, it becomes `arbitrary: false`. Everything else becomes `arbitrary: true` (for text) or `tool-use` (for tool_use).
10. POST each event in order: prose for text, tool-use for tool_use. Finally POST `turn-end`.

User kind (UserPromptSubmit):
- Read stdin → JSON. Extract user text (field name confirmed in Task 14 against current Claude Code docs; today's docs suggest `prompt`).
- POST a single prose event (`arbitrary=false`, no special grouping).
- No turn-end (user prompts don't end agent turns).

### Task 9: Transcript parsing — pure helpers

**Files:**
- Create: `packages/kernel/src/hooks/transcript.ts`
- Create: `packages/kernel/tests/hooks/transcript.test.ts`
- Create: `packages/kernel/tests/hooks/fixtures/transcript-*.jsonl`

- [ ] **Step 1: Create fixtures**

Create `packages/kernel/tests/hooks/fixtures/transcript-simple.jsonl`:

```jsonl
{"role":"user","content":[{"type":"text","text":"hi"}]}
{"role":"assistant","content":[{"type":"text","text":"hello!"}]}
```

Create `packages/kernel/tests/hooks/fixtures/transcript-tool-loop.jsonl`:

```jsonl
{"role":"user","content":[{"type":"text","text":"list files"}]}
{"role":"assistant","content":[{"type":"text","text":"I'll search."},{"type":"tool_use","id":"tu_1","name":"Bash","input":{"command":"ls"}}]}
{"role":"user","content":[{"type":"tool_result","tool_use_id":"tu_1","content":"a\nb\n"}]}
{"role":"assistant","content":[{"type":"text","text":"Found two files: a, b."}]}
```

Create `packages/kernel/tests/hooks/fixtures/transcript-mid-turn-no-conclusion.jsonl`:

```jsonl
{"role":"user","content":[{"type":"text","text":"clean tmp"}]}
{"role":"assistant","content":[{"type":"tool_use","id":"tu_1","name":"Bash","input":{"command":"rm -rf /tmp/x"}}]}
{"role":"user","content":[{"type":"tool_result","tool_use_id":"tu_1","content":""}]}
```

Create `packages/kernel/tests/hooks/fixtures/transcript-prior-turn.jsonl`:

```jsonl
{"role":"user","content":[{"type":"text","text":"first"}]}
{"role":"assistant","content":[{"type":"text","text":"reply1"}]}
{"role":"user","content":[{"type":"text","text":"second"}]}
{"role":"assistant","content":[{"type":"text","text":"reply2"}]}
```

- [ ] **Step 2: Write failing tests**

Create `packages/kernel/tests/hooks/transcript.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { readFile } from "fs/promises";
import { join } from "path";
import { extractLastAssistantTurn, type TurnBlock } from "../../src/hooks/transcript";

const fixturePath = (name: string) =>
  join(__dirname, "fixtures", name);

async function load(name: string): Promise<string> {
  return readFile(fixturePath(name), "utf8");
}

describe("extractLastAssistantTurn", () => {
  it("returns the single text block for a plain reply", async () => {
    const turn = extractLastAssistantTurn(await load("transcript-simple.jsonl"));
    expect(turn).toEqual([{ type: "text", text: "hello!" }]);
  });

  it("interleaves text + tool_use + text, pairs tool_result by id", async () => {
    const turn = extractLastAssistantTurn(await load("transcript-tool-loop.jsonl"));
    expect(turn).toEqual<TurnBlock[]>([
      { type: "text", text: "I'll search." },
      {
        type: "tool_use",
        id: "tu_1",
        name: "Bash",
        input: { command: "ls" },
        result: "a\nb\n",
        is_error: false,
      },
      { type: "text", text: "Found two files: a, b." },
    ]);
  });

  it("returns a turn with no trailing text when the model ended on a tool call", async () => {
    const turn = extractLastAssistantTurn(
      await load("transcript-mid-turn-no-conclusion.jsonl"),
    );
    expect(turn).toHaveLength(1);
    expect(turn[0].type).toBe("tool_use");
  });

  it("only returns the most recent turn", async () => {
    const turn = extractLastAssistantTurn(await load("transcript-prior-turn.jsonl"));
    expect(turn).toEqual([{ type: "text", text: "reply2" }]);
  });

  it("returns empty array when transcript ends mid user message", async () => {
    const onlyUser = `{"role":"user","content":[{"type":"text","text":"hi"}]}\n`;
    expect(extractLastAssistantTurn(onlyUser)).toEqual([]);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @f-mark/kernel test tests/hooks/transcript.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 4: Implement**

Create `packages/kernel/src/hooks/transcript.ts`:

```typescript
export type TurnBlock =
  | { type: "text"; text: string }
  | {
      type: "tool_use";
      id: string;
      name: string;
      input: unknown;
      result?: unknown;
      is_error?: boolean;
    };

interface RawEntry {
  role: "user" | "assistant" | string;
  content: Array<
    | { type: "text"; text: string }
    | { type: "tool_use"; id: string; name: string; input: unknown }
    | { type: "tool_result"; tool_use_id: string; content: unknown; is_error?: boolean }
    | { type: string; [k: string]: unknown }
  >;
}

function parseJsonl(raw: string): RawEntry[] {
  return raw
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as RawEntry);
}

function isToolResultOnly(entry: RawEntry): boolean {
  return (
    entry.role === "user" &&
    entry.content.length > 0 &&
    entry.content.every((b) => b.type === "tool_result")
  );
}

export function extractLastAssistantTurn(raw: string): TurnBlock[] {
  const entries = parseJsonl(raw);

  // Find the last assistant entry.
  let end = entries.length - 1;
  while (end >= 0 && entries[end].role !== "assistant") end--;
  if (end < 0) return [];

  // Walk back to gather contiguous assistant entries + interleaved tool_result user messages.
  let start = end;
  while (start - 1 >= 0) {
    const prev = entries[start - 1];
    if (prev.role === "assistant") {
      start -= 1;
    } else if (isToolResultOnly(prev)) {
      start -= 1;
    } else {
      break;
    }
  }

  // Build a tool_use_id → result map from any tool_result messages in the slice.
  const resultById = new Map<string, { content: unknown; is_error: boolean }>();
  for (let i = start; i <= end; i++) {
    const e = entries[i];
    if (e.role !== "user") continue;
    for (const block of e.content) {
      if (block.type === "tool_result") {
        resultById.set(block.tool_use_id, {
          content: block.content,
          is_error: block.is_error === true,
        });
      }
    }
  }

  // Flatten assistant content blocks only, in order.
  const out: TurnBlock[] = [];
  for (let i = start; i <= end; i++) {
    const e = entries[i];
    if (e.role !== "assistant") continue;
    for (const block of e.content) {
      if (block.type === "text") {
        out.push({ type: "text", text: block.text });
      } else if (block.type === "tool_use") {
        const r = resultById.get(block.id);
        out.push({
          type: "tool_use",
          id: block.id,
          name: block.name,
          input: block.input,
          result: r?.content,
          is_error: r?.is_error ?? false,
        });
      }
      // Ignore other block types (thinking, etc.)
    }
  }
  return out;
}
```

- [ ] **Step 5: Run tests**

Run: `pnpm --filter @f-mark/kernel test tests/hooks/transcript.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/kernel/src/hooks/transcript.ts packages/kernel/tests/hooks/transcript.test.ts packages/kernel/tests/hooks/fixtures/
git commit -m "feat(kernel): transcript JSONL → last-assistant-turn block extractor"
```

---

### Task 10: Block-to-event projection + noise filter

**Files:**
- Create: `packages/kernel/src/hooks/projectTurn.ts`
- Create: `packages/kernel/tests/hooks/projectTurn.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/kernel/tests/hooks/projectTurn.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { projectTurnToEvents, type ProjectedEvent } from "../../src/hooks/projectTurn";
import type { TurnBlock } from "../../src/hooks/transcript";

describe("projectTurnToEvents", () => {
  it("single text block → one concluding prose (arbitrary=false)", () => {
    const blocks: TurnBlock[] = [{ type: "text", text: "hello" }];
    expect(projectTurnToEvents(blocks)).toEqual<ProjectedEvent[]>([
      { kind: "prose", content: "hello", arbitrary: false },
    ]);
  });

  it("text + tool + text → arbitrary prose, tool-use, concluding prose", () => {
    const blocks: TurnBlock[] = [
      { type: "text", text: "I'll search." },
      {
        type: "tool_use",
        id: "tu_1",
        name: "Bash",
        input: { command: "ls" },
        result: "a\nb",
        is_error: false,
      },
      { type: "text", text: "Done." },
    ];
    expect(projectTurnToEvents(blocks)).toEqual<ProjectedEvent[]>([
      { kind: "prose", content: "I'll search.", arbitrary: true },
      {
        kind: "tool-use",
        tool_name: "Bash",
        tool_use_id: "tu_1",
        input: { command: "ls" },
        result: "a\nb",
        success: true,
      },
      { kind: "prose", content: "Done.", arbitrary: false },
    ]);
  });

  it("tool-only turn → only tool-use, no prose (group stays open)", () => {
    const blocks: TurnBlock[] = [
      { type: "tool_use", id: "x", name: "Read", input: {}, result: "", is_error: false },
    ];
    expect(projectTurnToEvents(blocks)).toEqual<ProjectedEvent[]>([
      { kind: "tool-use", tool_name: "Read", tool_use_id: "x", input: {}, result: "", success: true },
    ]);
  });

  it("drops empty/whitespace-only text blocks", () => {
    const blocks: TurnBlock[] = [
      { type: "text", text: "   " },
      { type: "tool_use", id: "x", name: "Read", input: {}, is_error: false },
      { type: "text", text: "\n\n" },
      { type: "text", text: "done." },
    ];
    expect(projectTurnToEvents(blocks)).toEqual<ProjectedEvent[]>([
      { kind: "tool-use", tool_name: "Read", tool_use_id: "x", input: {}, result: undefined, success: true },
      { kind: "prose", content: "done.", arbitrary: false },
    ]);
  });

  it("returns empty array when the whole turn was whitespace text only", () => {
    expect(projectTurnToEvents([{ type: "text", text: "  " }])).toEqual([]);
  });

  it("propagates is_error as success=false", () => {
    const blocks: TurnBlock[] = [
      { type: "tool_use", id: "x", name: "Bash", input: {}, result: "boom", is_error: true },
    ];
    const out = projectTurnToEvents(blocks);
    expect(out[0]).toMatchObject({ kind: "tool-use", success: false });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @f-mark/kernel test tests/hooks/projectTurn.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

Create `packages/kernel/src/hooks/projectTurn.ts`:

```typescript
import type { TurnBlock } from "./transcript";

export type ProjectedEvent =
  | { kind: "prose"; content: string; arbitrary: boolean }
  | {
      kind: "tool-use";
      tool_name: string;
      tool_use_id: string;
      input: unknown;
      result: unknown;
      success: boolean;
    };

export function projectTurnToEvents(blocks: TurnBlock[]): ProjectedEvent[] {
  // Filter whitespace-only text blocks; keep tool_use blocks as-is.
  const filtered = blocks.filter((b) => {
    if (b.type === "text") return b.text.trim().length > 0;
    return true;
  });
  if (filtered.length === 0) return [];

  // The concluding text block is the LAST text block in the filtered list,
  // and only if there is no tool_use after it. We can determine that by
  // walking from the end.
  let concludingIdx = -1;
  for (let i = filtered.length - 1; i >= 0; i--) {
    if (filtered[i].type === "text") {
      concludingIdx = i;
      break;
    }
    if (filtered[i].type === "tool_use") break; // text after this would have been seen first
  }

  return filtered.map((b, i) => {
    if (b.type === "text") {
      return {
        kind: "prose",
        content: b.text,
        arbitrary: i !== concludingIdx,
      };
    }
    return {
      kind: "tool-use",
      tool_name: b.name,
      tool_use_id: b.id,
      input: b.input,
      result: b.result,
      success: !b.is_error,
    };
  });
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @f-mark/kernel test tests/hooks/projectTurn.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/kernel/src/hooks/projectTurn.ts packages/kernel/tests/hooks/projectTurn.test.ts
git commit -m "feat(kernel): project turn blocks into ordered events (arbitrary/concluding/tool-use)"
```

---

### Task 11: Bootstrap helper — find `.f-mark/` and read config/token

**Files:**
- Create: `packages/kernel/src/hooks/bootstrap.ts`
- Create: `packages/kernel/tests/hooks/bootstrap.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/kernel/tests/hooks/bootstrap.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { mkdtemp, mkdir, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { findFmarkDir, loadHookContext } from "../../src/hooks/bootstrap";

describe("findFmarkDir", () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "fm-"));
    await mkdir(join(root, "project", ".f-mark"), { recursive: true });
    await mkdir(join(root, "project", "src", "deeper"), { recursive: true });
  });

  it("finds .f-mark/ from a deeper subdir", async () => {
    expect(await findFmarkDir(join(root, "project", "src", "deeper"))).toBe(
      join(root, "project", ".f-mark"),
    );
  });

  it("finds .f-mark/ when cwd is the project root itself", async () => {
    expect(await findFmarkDir(join(root, "project"))).toBe(join(root, "project", ".f-mark"));
  });

  it("returns null when no .f-mark exists above cwd", async () => {
    expect(await findFmarkDir(root)).toBeNull();
  });
});

describe("loadHookContext", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "fm-"));
    await mkdir(join(dir, ".f-mark"), { recursive: true });
    await writeFile(join(dir, ".f-mark", ".token"), "tok-abc\n", "utf8");
    await writeFile(
      join(dir, ".f-mark", "config.json"),
      JSON.stringify({ kernel: { port: 7780 } }),
      "utf8",
    );
  });

  it("returns kernel URL + token", async () => {
    const ctx = await loadHookContext(dir);
    expect(ctx).toMatchObject({
      fmarkDir: join(dir, ".f-mark"),
      kernelUrl: "http://localhost:7780",
      token: "tok-abc",
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @f-mark/kernel test tests/hooks/bootstrap.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

Create `packages/kernel/src/hooks/bootstrap.ts`:

```typescript
import { readFile, stat } from "fs/promises";
import { dirname, join } from "path";

export async function findFmarkDir(startCwd: string): Promise<string | null> {
  let cur = startCwd;
  while (true) {
    const candidate = join(cur, ".f-mark");
    try {
      const s = await stat(candidate);
      if (s.isDirectory()) return candidate;
    } catch {
      /* keep walking up */
    }
    const parent = dirname(cur);
    if (parent === cur) return null;
    cur = parent;
  }
}

export interface HookContext {
  fmarkDir: string;
  kernelUrl: string;
  token: string;
}

export async function loadHookContext(cwd: string): Promise<HookContext> {
  const fmarkDir = await findFmarkDir(cwd);
  if (!fmarkDir) throw new Error(`no .f-mark/ found above ${cwd}`);
  const token = (await readFile(join(fmarkDir, ".token"), "utf8")).trim();
  const cfg = JSON.parse(await readFile(join(fmarkDir, "config.json"), "utf8")) as {
    kernel?: { port?: number; host?: string };
  };
  const port = cfg.kernel?.port ?? 7777;
  const host = cfg.kernel?.host ?? "localhost";
  return { fmarkDir, kernelUrl: `http://${host}:${port}`, token };
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @f-mark/kernel test tests/hooks/bootstrap.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/kernel/src/hooks/bootstrap.ts packages/kernel/tests/hooks/bootstrap.test.ts
git commit -m "feat(kernel): hook bootstrap — locate .f-mark, load token + kernel URL"
```

---

### Task 12: HTTP poster + turn-end dispatch

**Files:**
- Create: `packages/kernel/src/hooks/post.ts`
- Create: `packages/kernel/tests/hooks/post.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/kernel/tests/hooks/post.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { postProjectedEvents } from "../../src/hooks/post";
import type { ProjectedEvent } from "../../src/hooks/projectTurn";

describe("postProjectedEvents", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })));
  });

  const ctx = {
    fmarkDir: "/tmp/fm/.f-mark",
    kernelUrl: "http://localhost:7777",
    token: "tok",
  };

  it("posts each projected event in order, then turn-end", async () => {
    const events: ProjectedEvent[] = [
      { kind: "prose", content: "I'll search.", arbitrary: true },
      { kind: "tool-use", tool_name: "Bash", tool_use_id: "tu_1", input: { command: "ls" }, result: "a", success: true },
      { kind: "prose", content: "Done.", arbitrary: false },
    ];
    await postProjectedEvents(ctx, "ag-claude", "sess-1", events);

    const f = (globalThis.fetch as any) as ReturnType<typeof vi.fn>;
    expect(f).toHaveBeenCalledTimes(4); // 3 events + turn-end
    expect(f.mock.calls[0][0]).toBe("http://localhost:7777/sessions/sess-1/events/prose");
    expect(JSON.parse(f.mock.calls[0][1].body)).toMatchObject({
      participant_id: "ag-claude",
      content: "I'll search.",
      arbitrary: true,
    });
    expect(f.mock.calls[1][0]).toBe("http://localhost:7777/sessions/sess-1/events/tool-use");
    expect(JSON.parse(f.mock.calls[1][1].body)).toMatchObject({
      tool_name: "Bash",
      tool_use_id: "tu_1",
      success: true,
    });
    expect(f.mock.calls[2][0]).toBe("http://localhost:7777/sessions/sess-1/events/prose");
    expect(JSON.parse(f.mock.calls[2][1].body)).toMatchObject({
      content: "Done.",
      arbitrary: false,
    });
    expect(f.mock.calls[3][0]).toBe("http://localhost:7777/sessions/sess-1/events/turn-end");
  });

  it("skips turn-end when there is no concluding prose (turn ended on tool-use)", async () => {
    const events: ProjectedEvent[] = [
      { kind: "tool-use", tool_name: "Bash", tool_use_id: "x", input: {}, result: "", success: true },
    ];
    await postProjectedEvents(ctx, "ag-claude", "sess-1", events);
    const f = (globalThis.fetch as any) as ReturnType<typeof vi.fn>;
    expect(f).toHaveBeenCalledTimes(1);
    expect(f.mock.calls[0][0]).not.toContain("turn-end");
  });

  it("sets Authorization: Bearer", async () => {
    await postProjectedEvents(ctx, "ag-claude", "sess-1", [
      { kind: "prose", content: "hi", arbitrary: false },
    ]);
    const f = (globalThis.fetch as any) as ReturnType<typeof vi.fn>;
    expect(f.mock.calls[0][1].headers.Authorization).toBe("Bearer tok");
  });

  it("throws on non-2xx response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 401 })));
    await expect(
      postProjectedEvents(ctx, "ag-claude", "sess-1", [
        { kind: "prose", content: "x", arbitrary: false },
      ]),
    ).rejects.toThrow(/401/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @f-mark/kernel test tests/hooks/post.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

Create `packages/kernel/src/hooks/post.ts`:

```typescript
import type { HookContext } from "./bootstrap";
import type { ProjectedEvent } from "./projectTurn";

async function httpPost(url: string, token: string, body: unknown): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`POST ${url} → ${res.status}`);
  }
}

export async function postProjectedEvents(
  ctx: HookContext,
  participantId: string,
  sessionId: string,
  events: ProjectedEvent[],
): Promise<void> {
  let lastWasConcluding = false;
  for (const ev of events) {
    if (ev.kind === "prose") {
      await httpPost(`${ctx.kernelUrl}/sessions/${sessionId}/events/prose`, ctx.token, {
        participant_id: participantId,
        content: ev.content,
        arbitrary: ev.arbitrary,
      });
      lastWasConcluding = !ev.arbitrary;
    } else {
      await httpPost(`${ctx.kernelUrl}/sessions/${sessionId}/events/tool-use`, ctx.token, {
        participant_id: participantId,
        tool_name: ev.tool_name,
        tool_use_id: ev.tool_use_id,
        input: ev.input,
        result: ev.result,
        success: ev.success,
      });
      lastWasConcluding = false;
    }
  }
  if (lastWasConcluding) {
    await httpPost(`${ctx.kernelUrl}/sessions/${sessionId}/events/turn-end`, ctx.token, {
      participant_id: participantId,
    });
  }
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @f-mark/kernel test tests/hooks/post.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/kernel/src/hooks/post.ts packages/kernel/tests/hooks/post.test.ts
git commit -m "feat(kernel): HTTP poster for projected events + turn-end"
```

---

### Task 13: Top-level `autoStream` handler (assistant)

**Files:**
- Create: `packages/kernel/src/hooks/autoStream.ts`
- Create: `packages/kernel/tests/hooks/autoStream.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/kernel/tests/hooks/autoStream.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mkdtemp, mkdir, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { runAutoStream } from "../../src/hooks/autoStream";
import { writeActiveSession } from "../../src/agents/activeSession";

async function bootstrapProject() {
  const dir = await mkdtemp(join(tmpdir(), "fm-"));
  const fmark = join(dir, ".f-mark");
  await mkdir(fmark, { recursive: true });
  await writeFile(join(fmark, ".token"), "tok-1", "utf8");
  await writeFile(join(fmark, "config.json"), JSON.stringify({ kernel: { port: 7777 } }), "utf8");
  await writeActiveSession(fmark, "ag-claude", "sess-1");
  const transcript = join(dir, "transcript.jsonl");
  await writeFile(
    transcript,
    [
      JSON.stringify({ role: "user", content: [{ type: "text", text: "hi" }] }),
      JSON.stringify({ role: "assistant", content: [{ type: "text", text: "hello!" }] }),
    ].join("\n"),
    "utf8",
  );
  return { dir, fmark, transcript };
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
});

describe("runAutoStream(assistant)", () => {
  it("posts a concluding prose + turn-end for a one-message turn", async () => {
    const { dir, transcript } = await bootstrapProject();
    const stdin = {
      session_id: "claude-1",
      transcript_path: transcript,
      cwd: dir,
      hook_event_name: "Stop",
      stop_hook_active: false,
    };
    const exit = await runAutoStream("ag-claude", "assistant", JSON.stringify(stdin));
    expect(exit).toBe(0);
    const f = (globalThis.fetch as any) as ReturnType<typeof vi.fn>;
    expect(f).toHaveBeenCalledTimes(2);
    expect(f.mock.calls[0][0]).toContain("/sessions/sess-1/events/prose");
    expect(JSON.parse(f.mock.calls[0][1].body)).toMatchObject({ arbitrary: false, content: "hello!" });
    expect(f.mock.calls[1][0]).toContain("/sessions/sess-1/events/turn-end");
  });

  it("short-circuits when stop_hook_active=true", async () => {
    const { dir, transcript } = await bootstrapProject();
    const stdin = {
      session_id: "claude-1",
      transcript_path: transcript,
      cwd: dir,
      hook_event_name: "Stop",
      stop_hook_active: true,
    };
    const exit = await runAutoStream("ag-claude", "assistant", JSON.stringify(stdin));
    expect(exit).toBe(0);
    expect((globalThis.fetch as any)).not.toHaveBeenCalled();
  });

  it("exits 0 with stderr warning when no active-session pointer exists", async () => {
    const { dir, transcript } = await bootstrapProject();
    // unlink the pointer
    await writeFile(join(dir, ".f-mark", "agents", "ag-unknown", "active-session"), "", "utf8").catch(() => {});
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const exit = await runAutoStream("ag-unknown", "assistant", JSON.stringify({
      session_id: "claude-1",
      transcript_path: transcript,
      cwd: dir,
      hook_event_name: "Stop",
      stop_hook_active: false,
    }));
    expect(exit).toBe(0);
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining("no active session"));
    expect((globalThis.fetch as any)).not.toHaveBeenCalled();
    stderr.mockRestore();
  });
});

describe("runAutoStream(user)", () => {
  it("posts user prompt as non-arbitrary prose, no turn-end", async () => {
    const { dir } = await bootstrapProject();
    const stdin = {
      cwd: dir,
      hook_event_name: "UserPromptSubmit",
      prompt: "rerun the suite please",
    };
    const exit = await runAutoStream("us-roey", "user", JSON.stringify(stdin));
    expect(exit).toBe(0);
    const f = (globalThis.fetch as any) as ReturnType<typeof vi.fn>;
    expect(f).toHaveBeenCalledTimes(1);
    expect(f.mock.calls[0][0]).toContain("/events/prose");
    expect(JSON.parse(f.mock.calls[0][1].body)).toMatchObject({
      content: "rerun the suite please",
      arbitrary: false,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @f-mark/kernel test tests/hooks/autoStream.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

Create `packages/kernel/src/hooks/autoStream.ts`:

```typescript
import { readFile } from "fs/promises";
import { readActiveSession } from "../agents/activeSession";
import { loadHookContext } from "./bootstrap";
import { postProjectedEvents } from "./post";
import { projectTurnToEvents } from "./projectTurn";
import { extractLastAssistantTurn } from "./transcript";

export type AutoStreamKind = "assistant" | "user";

interface AssistantStdin {
  session_id: string;
  transcript_path: string;
  cwd: string;
  hook_event_name: string;
  stop_hook_active?: boolean;
}

interface UserStdin {
  cwd: string;
  hook_event_name: string;
  prompt?: string;
  user_input?: string; // fallback if a runtime uses this name
}

export async function runAutoStream(
  participantId: string,
  kind: AutoStreamKind,
  stdinRaw: string,
): Promise<number> {
  let payload: AssistantStdin | UserStdin;
  try {
    payload = JSON.parse(stdinRaw);
  } catch {
    process.stderr.write("f-mark auto-stream: invalid JSON on stdin\n");
    return 0;
  }

  const cwd = (payload as { cwd?: string }).cwd ?? process.cwd();
  let ctx;
  try {
    ctx = await loadHookContext(cwd);
  } catch (err: any) {
    process.stderr.write(`f-mark auto-stream: ${err.message}\n`);
    return 0;
  }

  const sessionId = await readActiveSession(ctx.fmarkDir, participantId);
  if (!sessionId) {
    process.stderr.write(
      `f-mark auto-stream: no active session for ${participantId}; run POST /agents/${participantId}/link first\n`,
    );
    return 0;
  }

  if (kind === "assistant") {
    const a = payload as AssistantStdin;
    if (a.stop_hook_active === true) return 0;
    let transcript: string;
    try {
      transcript = await readFile(a.transcript_path, "utf8");
    } catch (err: any) {
      process.stderr.write(`f-mark auto-stream: cannot read transcript ${a.transcript_path}: ${err.message}\n`);
      return 0;
    }
    const blocks = extractLastAssistantTurn(transcript);
    const events = projectTurnToEvents(blocks);
    if (events.length === 0) return 0;
    await postProjectedEvents(ctx, participantId, sessionId, events);
    return 0;
  }

  // kind === "user"
  const u = payload as UserStdin;
  const text = (u.prompt ?? u.user_input ?? "").trim();
  if (!text) return 0;
  await postProjectedEvents(ctx, participantId, sessionId, [
    { kind: "prose", content: text, arbitrary: false },
  ]);
  return 0;
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @f-mark/kernel test tests/hooks/autoStream.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/kernel/src/hooks/autoStream.ts packages/kernel/tests/hooks/autoStream.test.ts
git commit -m "feat(kernel): runAutoStream — assistant turn + user prompt orchestration"
```

---

### Task 14: CLI subcommand `f-mark hook auto-stream`

**Files:**
- Modify: `packages/kernel/src/cli.ts` (read this file first to see how its existing args are parsed — match the style: yargs / commander / hand-rolled)
- Test: depends on cli framework — most CLIs are tested by invoking the exported main fn

- [ ] **Step 1: Read the CLI file**

Run: `head -200 packages/kernel/src/cli.ts` (so you know which arg parser is already used; mirror it).

- [ ] **Step 2: Write failing CLI test**

Create `packages/kernel/tests/cli/hook-autoStream.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { runCli } from "../../src/cli";

describe("CLI: f-mark hook auto-stream", () => {
  it("invokes runAutoStream with the participant_id arg and kind default=assistant", async () => {
    const mod = await import("../../src/hooks/autoStream");
    const spy = vi.spyOn(mod, "runAutoStream").mockResolvedValue(0);
    // Provide stdin as a string source the CLI accepts (via a test seam).
    await runCli(["hook", "auto-stream", "ag-claude"], { stdin: '{"cwd":"/tmp"}' });
    expect(spy).toHaveBeenCalledWith("ag-claude", "assistant", '{"cwd":"/tmp"}');
  });

  it("supports --kind user", async () => {
    const mod = await import("../../src/hooks/autoStream");
    const spy = vi.spyOn(mod, "runAutoStream").mockResolvedValue(0);
    await runCli(["hook", "auto-stream", "us-roey", "--kind", "user"], { stdin: '{"prompt":"hi"}' });
    expect(spy).toHaveBeenCalledWith("us-roey", "user", '{"prompt":"hi"}');
  });
});
```

(If `runCli` doesn't exist, refactor the cli.ts entry to export a testable `runCli(argv, { stdin?, stdout?, stderr? })` and have the binary entry call it with `process.argv.slice(2)` and `process.stdin` slurped.)

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @f-mark/kernel test tests/cli/hook-autoStream.test.ts`
Expected: FAIL — subcommand unknown.

- [ ] **Step 4: Wire subcommand**

In `packages/kernel/src/cli.ts`:

```typescript
import { runAutoStream } from "./hooks/autoStream";

// inside the dispatch:
if (argv[0] === "hook" && argv[1] === "auto-stream") {
  const participantId = argv[2];
  const kindFlag = argv.indexOf("--kind");
  const kind = kindFlag >= 0 ? (argv[kindFlag + 1] as "assistant" | "user") : "assistant";
  if (!participantId) {
    process.stderr.write("usage: f-mark hook auto-stream <participant_id> [--kind assistant|user]\n");
    return 2;
  }
  const stdinRaw = opts?.stdin ?? (await readAllStdin());
  return runAutoStream(participantId, kind, stdinRaw);
}
```

(Where `readAllStdin()` collects `process.stdin` into a string — extract or import a tiny helper.)

- [ ] **Step 5: Run tests**

Run: `pnpm --filter @f-mark/kernel test tests/cli/hook-autoStream.test.ts`
Expected: PASS

- [ ] **Step 6: Verify the binary still parses other args**

Run: `pnpm --filter @f-mark/kernel test`
Expected: full kernel test suite green.

- [ ] **Step 7: Commit**

```bash
git add packages/kernel/src/cli.ts packages/kernel/tests/cli/hook-autoStream.test.ts
git commit -m "feat(kernel): CLI subcommand 'hook auto-stream'"
```

---

## Phase 4 — Renderer: tool-use card

### Task 15: Tool icon mapping

**Files:**
- Create: `packages/renderer/src/feed/toolIcons.ts`
- Create: `packages/renderer/src/feed/toolIcons.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/renderer/src/feed/toolIcons.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { iconForTool, DEFAULT_TOOL_ICON } from "./toolIcons";

describe("iconForTool", () => {
  it("known names map to specific icons", () => {
    expect(iconForTool("Bash")).toBe("terminal");
    expect(iconForTool("Read")).toBe("file-text");
    expect(iconForTool("Edit")).toBe("edit-3");
    expect(iconForTool("Write")).toBe("file-plus");
    expect(iconForTool("WebFetch")).toBe("globe");
    expect(iconForTool("WebSearch")).toBe("search");
  });

  it("unknown names fall back to the default icon", () => {
    expect(iconForTool("SomethingNew")).toBe(DEFAULT_TOOL_ICON);
  });

  it("case-insensitive matching", () => {
    expect(iconForTool("bash")).toBe("terminal");
    expect(iconForTool("READ")).toBe("file-text");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @f-mark/renderer test src/feed/toolIcons.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

Create `packages/renderer/src/feed/toolIcons.ts`:

```typescript
export const DEFAULT_TOOL_ICON = "tool";

// Map runtime tool names → lucide-react icon names (or whatever icon lib is used in the renderer).
const MAP: Record<string, string> = {
  bash: "terminal",
  read: "file-text",
  edit: "edit-3",
  write: "file-plus",
  webfetch: "globe",
  websearch: "search",
  glob: "filter",
  grep: "search",
  task: "users",
  notebookedit: "book-open",
  todowrite: "list-checks",
};

export function iconForTool(name: string): string {
  return MAP[name.toLowerCase()] ?? DEFAULT_TOOL_ICON;
}
```

(If the renderer already uses a specific icon library — e.g., lucide-react vs heroicons — verify the icon names exist. Adjust the strings to match the actual icon component names being imported elsewhere in the renderer.)

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @f-mark/renderer test src/feed/toolIcons.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/renderer/src/feed/toolIcons.ts packages/renderer/src/feed/toolIcons.test.ts
git commit -m "feat(renderer): tool-name → icon mapping for tool-use cards"
```

---

### Task 16: `ToolUseCard` component

**Files:**
- Create: `packages/renderer/src/cards/ToolUseCard.tsx`
- Create: `packages/renderer/src/cards/ToolUseCard.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `packages/renderer/src/cards/ToolUseCard.test.tsx`:

```typescript
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ToolUseCard } from "./ToolUseCard";
import type { ToolUseEventRecord } from "@f-mark/shared/events";

function makeEvent(over: Partial<ToolUseEventRecord["payload"]> = {}): ToolUseEventRecord {
  return {
    filename: "20260523T100000Z_ag-claude.tool-use.json",
    timestamp: "20260523T100000Z",
    participant_id: "ag-claude",
    kind: "tool-use",
    payload: {
      tool_name: "Bash",
      tool_use_id: "tu_1",
      input: { command: "ls -la" },
      result: "total 0\n",
      success: true,
      duration_ms: 14,
      ...over,
    },
  };
}

describe("<ToolUseCard>", () => {
  it("renders the tool name and starts collapsed", () => {
    render(<ToolUseCard event={makeEvent()} />);
    expect(screen.getByText("Bash")).toBeInTheDocument();
    expect(screen.queryByText("ls -la")).not.toBeInTheDocument();
  });

  it("expands input + result on click", () => {
    render(<ToolUseCard event={makeEvent()} />);
    fireEvent.click(screen.getByRole("button", { name: /toggle tool details/i }));
    expect(screen.getByText(/ls -la/)).toBeInTheDocument();
    expect(screen.getByText(/total 0/)).toBeInTheDocument();
  });

  it("shows an error state when success=false", () => {
    render(<ToolUseCard event={makeEvent({ success: false, result: "permission denied" })} />);
    expect(screen.getByText(/error|failed/i)).toBeInTheDocument();
  });

  it("renders duration when present", () => {
    render(<ToolUseCard event={makeEvent({ duration_ms: 1234 })} />);
    expect(screen.getByText(/1\.2\s*s|1234\s*ms/)).toBeInTheDocument();
  });

  it("omits result section when result is undefined (turn ended mid-tool)", () => {
    render(<ToolUseCard event={makeEvent({ result: undefined })} />);
    fireEvent.click(screen.getByRole("button", { name: /toggle tool details/i }));
    expect(screen.queryByText(/result/i)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @f-mark/renderer test src/cards/ToolUseCard.test.tsx`
Expected: FAIL — component missing.

- [ ] **Step 3: Implement**

Create `packages/renderer/src/cards/ToolUseCard.tsx`:

```tsx
import { useState } from "react";
import type { ToolUseEventRecord } from "@f-mark/shared/events";
import { iconForTool } from "../feed/toolIcons";

function formatDuration(ms?: number): string | null {
  if (ms === undefined) return null;
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

function stringifyForDisplay(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export interface ToolUseCardProps {
  event: ToolUseEventRecord;
}

export function ToolUseCard({ event }: ToolUseCardProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const { tool_name, input, result, success, duration_ms } = event.payload;
  const duration = formatDuration(duration_ms);

  return (
    <div className={`fm-card fm-tool-use ${success ? "" : "fm-tool-use--error"}`}>
      <button
        type="button"
        aria-label="toggle tool details"
        onClick={() => setOpen((v) => !v)}
        className="fm-tool-use__header"
      >
        <span className={`fm-icon fm-icon--${iconForTool(tool_name)}`} aria-hidden />
        <span className="fm-tool-use__name">{tool_name}</span>
        {!success && <span className="fm-tool-use__status">failed</span>}
        {duration && <span className="fm-tool-use__duration">{duration}</span>}
        <span className="fm-tool-use__chevron" aria-hidden>{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="fm-tool-use__body">
          <section>
            <h4>input</h4>
            <pre>{stringifyForDisplay(input)}</pre>
          </section>
          {result !== undefined && (
            <section>
              <h4>result</h4>
              <pre>{stringifyForDisplay(result)}</pre>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
```

(Match the existing card-styling convention — e.g., if other cards use Tailwind utility classes or a `fm-` prefixed BEM convention, follow whichever is already in `ProseCard.tsx`. Adjust accordingly.)

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @f-mark/renderer test src/cards/ToolUseCard.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/renderer/src/cards/ToolUseCard.tsx packages/renderer/src/cards/ToolUseCard.test.tsx
git commit -m "feat(renderer): ToolUseCard with expandable input/result"
```

---

### Task 17: Dispatch tool-use in `EventCard`

**Files:**
- Modify: `packages/renderer/src/cards/EventCard.tsx:1-82`
- Modify: `packages/renderer/src/cards/EventCard.test.tsx` (existing — append)

- [ ] **Step 1: Write failing dispatch test**

Append to `packages/renderer/src/cards/EventCard.test.tsx`:

```typescript
it("dispatches tool-use kind to ToolUseCard", () => {
  const ev: ToolUseEventRecord = {
    filename: "20260523T100000Z_ag-claude.tool-use.json",
    timestamp: "20260523T100000Z",
    participant_id: "ag-claude",
    kind: "tool-use",
    payload: { tool_name: "Bash", tool_use_id: "tu_1", input: {}, success: true },
  };
  render(<EventCard event={ev} />);
  expect(screen.getByText("Bash")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @f-mark/renderer test src/cards/EventCard.test.tsx`
Expected: FAIL — falls through to `null`.

- [ ] **Step 3: Add dispatch branch**

In `packages/renderer/src/cards/EventCard.tsx`, add (before the final `return null`):

```tsx
if (event.kind === "tool-use") {
  return <ToolUseCard event={event} />;
}
```

Add the import: `import { ToolUseCard } from "./ToolUseCard";`

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @f-mark/renderer test src/cards/EventCard.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/renderer/src/cards/EventCard.tsx packages/renderer/src/cards/EventCard.test.tsx
git commit -m "feat(renderer): dispatch tool-use events to ToolUseCard"
```

---

## Phase 5 — Renderer: arbitrary grouping

The renderer projects the raw event stream into a virtual feed where consecutive *mid-turn* items by the same participant are wrapped into a single `ArbitraryGroup` virtual item. "Mid-turn" means:
- `prose` events with `arbitrary === true`, OR
- `tool-use` events (always grouped as mid-turn)

The group opens at the first qualifying event from a participant. It closes when:
- A `prose` event with `arbitrary !== true` (concluding prose) arrives from the same participant, **or**
- The same participant emits a `turn-end` event, **or**
- A different participant's event arrives (we don't cross-mix participants).

When closed by a concluding prose, the concluding prose stays as its own card directly below the group. When closed by `turn-end`, the group stays open visually until a concluding event arrives (semantically "still streaming"), but is auto-collapsed visually.

### Task 18: `projectFeed` — group projection

**Files:**
- Create: `packages/renderer/src/feed/projectFeed.ts`
- Create: `packages/renderer/src/feed/projectFeed.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/renderer/src/feed/projectFeed.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { projectFeed, type FeedItem } from "./projectFeed";
import type { AnyEventRecord } from "@f-mark/shared/events";

function prose(participant: string, content: string, arbitrary?: boolean, ts = "20260523T100000Z"): AnyEventRecord {
  return {
    filename: `${ts}_${participant}.prose.md`,
    timestamp: ts,
    participant_id: participant,
    kind: "prose",
    payload: { content, ...(arbitrary !== undefined ? { arbitrary } : {}) },
  };
}

function tool(participant: string, name: string, ts = "20260523T100001Z"): AnyEventRecord {
  return {
    filename: `${ts}_${participant}.tool-use.json`,
    timestamp: ts,
    participant_id: participant,
    kind: "tool-use",
    payload: { tool_name: name, tool_use_id: "tu_1", input: {}, success: true },
  };
}

function turnEnd(participant: string, ts = "20260523T100005Z"): AnyEventRecord {
  return {
    filename: `${ts}_${participant}.turn-end.json`,
    timestamp: ts,
    participant_id: participant,
    kind: "turn-end",
    payload: {},
  };
}

describe("projectFeed", () => {
  it("passes through deliberate prose unchanged", () => {
    const ev = [prose("ag-claude", "hello")];
    const out = projectFeed(ev);
    expect(out).toEqual<FeedItem[]>([{ type: "event", event: ev[0] }]);
  });

  it("wraps consecutive arbitrary prose + tool-use into a single group", () => {
    const ev = [
      prose("ag-claude", "I'll search.", true, "20260523T100000Z"),
      tool("ag-claude", "Bash", "20260523T100001Z"),
      prose("ag-claude", "Done.", false, "20260523T100002Z"),
    ];
    const out = projectFeed(ev);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({
      type: "group",
      participant_id: "ag-claude",
      items: [ev[0], ev[1]],
      status: "concluded",
      toolCount: 1,
      timeRangeStart: "20260523T100000Z",
      timeRangeEnd: "20260523T100001Z",
    });
    expect(out[1]).toEqual({ type: "event", event: ev[2] });
  });

  it("group remains 'streaming' when no concluding prose exists yet", () => {
    const ev = [
      prose("ag-claude", "Thinking...", true, "20260523T100000Z"),
      tool("ag-claude", "Read", "20260523T100001Z"),
    ];
    const out = projectFeed(ev);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ type: "group", status: "streaming" });
  });

  it("group ends on different participant's event", () => {
    const ev = [
      prose("ag-claude", "I'll search.", true),
      tool("ag-claude", "Bash"),
      prose("us-roey", "hold on", false),
    ];
    const out = projectFeed(ev);
    expect(out).toHaveLength(2);
    expect(out[0].type).toBe("group");
    expect(out[1]).toEqual({ type: "event", event: ev[2] });
  });

  it("group concluded by turn-end (no follow-up prose) → status=ended", () => {
    const ev = [
      prose("ag-claude", "Thinking", true),
      tool("ag-claude", "Bash"),
      turnEnd("ag-claude"),
    ];
    const out = projectFeed(ev);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ type: "group", status: "ended" });
  });

  it("two separate groups when participant emits two distinct turns", () => {
    const ev = [
      prose("ag-claude", "first", true, "20260523T100000Z"),
      prose("ag-claude", "done", false, "20260523T100001Z"),
      prose("ag-claude", "second", true, "20260523T100100Z"),
      tool("ag-claude", "Read", "20260523T100101Z"),
    ];
    const out = projectFeed(ev);
    // group + concluding + group
    expect(out).toHaveLength(3);
    expect(out[0].type).toBe("group");
    expect(out[1].type).toBe("event"); // concluding "done"
    expect(out[2]).toMatchObject({ type: "group", status: "streaming" });
  });

  it("a single arbitrary prose still becomes a group (so the box is opened immediately)", () => {
    const ev = [prose("ag-claude", "Thinking...", true)];
    const out = projectFeed(ev);
    expect(out).toEqual<FeedItem[]>([
      expect.objectContaining({ type: "group", status: "streaming", toolCount: 0, items: ev }),
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @f-mark/renderer test src/feed/projectFeed.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

Create `packages/renderer/src/feed/projectFeed.ts`:

```typescript
import type { AnyEventRecord } from "@f-mark/shared/events";

export type GroupStatus = "streaming" | "concluded" | "ended";

export interface ArbitraryGroup {
  type: "group";
  participant_id: string;
  items: AnyEventRecord[];
  status: GroupStatus;
  toolCount: number;
  timeRangeStart: string;
  timeRangeEnd: string;
}

export interface SingleEventItem {
  type: "event";
  event: AnyEventRecord;
}

export type FeedItem = ArbitraryGroup | SingleEventItem;

function isMidTurn(ev: AnyEventRecord): boolean {
  if (ev.kind === "tool-use") return true;
  if (ev.kind === "prose") {
    const p = ev.payload as { arbitrary?: boolean };
    return p.arbitrary === true;
  }
  return false;
}

function isConcluding(ev: AnyEventRecord): boolean {
  if (ev.kind !== "prose") return false;
  const p = ev.payload as { arbitrary?: boolean };
  return p.arbitrary !== true;
}

function finalize(
  group: AnyEventRecord[],
  participant: string,
  status: GroupStatus,
): ArbitraryGroup {
  const toolCount = group.filter((e) => e.kind === "tool-use").length;
  return {
    type: "group",
    participant_id: participant,
    items: group,
    status,
    toolCount,
    timeRangeStart: group[0].timestamp,
    timeRangeEnd: group[group.length - 1].timestamp,
  };
}

export function projectFeed(events: AnyEventRecord[]): FeedItem[] {
  const out: FeedItem[] = [];
  let buf: AnyEventRecord[] = [];
  let bufParticipant: string | null = null;

  const flush = (status: GroupStatus) => {
    if (buf.length === 0) return;
    out.push(finalize(buf, bufParticipant!, status));
    buf = [];
    bufParticipant = null;
  };

  for (const ev of events) {
    if (isMidTurn(ev)) {
      if (bufParticipant !== null && bufParticipant !== ev.participant_id) {
        flush("streaming");
      }
      buf.push(ev);
      bufParticipant = ev.participant_id;
      continue;
    }
    // not mid-turn
    if (bufParticipant !== null && bufParticipant === ev.participant_id) {
      if (isConcluding(ev)) {
        flush("concluded");
        out.push({ type: "event", event: ev });
        continue;
      }
      if (ev.kind === "turn-end") {
        flush("ended");
        // turn-end itself is not pushed as a card (existing behavior — adjust if turn-end has a visible marker)
        continue;
      }
    } else if (bufParticipant !== null) {
      flush("streaming");
    }
    out.push({ type: "event", event: ev });
  }
  flush("streaming");
  return out;
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @f-mark/renderer test src/feed/projectFeed.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/renderer/src/feed/projectFeed.ts packages/renderer/src/feed/projectFeed.test.ts
git commit -m "feat(renderer): projectFeed groups arbitrary + tool-use into virtual feed items"
```

---

### Task 19: `ArbitraryGroupCard` component

**Files:**
- Create: `packages/renderer/src/cards/ArbitraryGroupCard.tsx`
- Create: `packages/renderer/src/cards/ArbitraryGroupCard.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `packages/renderer/src/cards/ArbitraryGroupCard.test.tsx`:

```typescript
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ArbitraryGroupCard } from "./ArbitraryGroupCard";
import type { ArbitraryGroup } from "../feed/projectFeed";
import type { AnyEventRecord } from "@f-mark/shared/events";

function prose(content: string, ts: string): AnyEventRecord {
  return {
    filename: `${ts}_ag-claude.prose.md`,
    timestamp: ts,
    participant_id: "ag-claude",
    kind: "prose",
    payload: { content, arbitrary: true },
  };
}
function tool(name: string, ts: string): AnyEventRecord {
  return {
    filename: `${ts}_ag-claude.tool-use.json`,
    timestamp: ts,
    participant_id: "ag-claude",
    kind: "tool-use",
    payload: { tool_name: name, tool_use_id: "x", input: {}, success: true },
  };
}

function makeGroup(over: Partial<ArbitraryGroup> = {}): ArbitraryGroup {
  return {
    type: "group",
    participant_id: "ag-claude",
    items: [prose("hmm", "20260523T100000Z"), tool("Bash", "20260523T100002Z")],
    status: "streaming",
    toolCount: 1,
    timeRangeStart: "20260523T100000Z",
    timeRangeEnd: "20260523T100002Z",
    ...over,
  };
}

describe("<ArbitraryGroupCard>", () => {
  it("is OPEN by default when status=streaming", () => {
    render(<ArbitraryGroupCard group={makeGroup()} now={new Date("2026-05-23T10:00:05Z")} />);
    expect(screen.getByText("hmm")).toBeInTheDocument();
    expect(screen.getByText(/Bash/)).toBeInTheDocument();
  });

  it("is COLLAPSED by default when status=concluded", () => {
    render(<ArbitraryGroupCard group={makeGroup({ status: "concluded" })} now={new Date("2026-05-23T10:00:05Z")} />);
    expect(screen.queryByText("hmm")).not.toBeInTheDocument();
  });

  it("is COLLAPSED by default when status=ended", () => {
    render(<ArbitraryGroupCard group={makeGroup({ status: "ended" })} now={new Date("2026-05-23T10:00:05Z")} />);
    expect(screen.queryByText("hmm")).not.toBeInTheDocument();
  });

  it("title shows tool count", () => {
    render(<ArbitraryGroupCard group={makeGroup({ toolCount: 3 })} now={new Date()} />);
    expect(screen.getByText(/3 tools?/)).toBeInTheDocument();
  });

  it("title shows time range start→end when concluded", () => {
    render(<ArbitraryGroupCard group={makeGroup({ status: "concluded" })} now={new Date()} />);
    // 2s elapsed between start and end
    expect(screen.getByText(/2\s*s|2s/)).toBeInTheDocument();
  });

  it("title shows elapsed-since-start when streaming", () => {
    const now = new Date("2026-05-23T10:01:00Z"); // 60s after start
    render(<ArbitraryGroupCard group={makeGroup({ status: "streaming" })} now={now} />);
    expect(screen.getByText(/1\s*min|60\s*s/)).toBeInTheDocument();
  });

  it("clicking the header toggles open/closed", () => {
    render(<ArbitraryGroupCard group={makeGroup({ status: "concluded" })} now={new Date()} />);
    fireEvent.click(screen.getByRole("button", { name: /toggle group/i }));
    expect(screen.getByText("hmm")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @f-mark/renderer test src/cards/ArbitraryGroupCard.test.tsx`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

Create `packages/renderer/src/cards/ArbitraryGroupCard.tsx`:

```tsx
import { useState } from "react";
import type { ArbitraryGroup } from "../feed/projectFeed";
import { EventCard } from "./EventCard";

function parseTs(iso: string): Date {
  // F-Mark uses ISO compact: 20260523T100000Z → 2026-05-23T10:00:00Z
  const m = iso.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  if (!m) return new Date(iso);
  return new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`);
}

function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${Math.round(ms / 1000)} s`;
  const min = Math.floor(ms / 60_000);
  const sec = Math.round((ms % 60_000) / 1000);
  return sec === 0 ? `${min} min` : `${min} min ${sec} s`;
}

export interface ArbitraryGroupCardProps {
  group: ArbitraryGroup;
  now?: Date;
}

export function ArbitraryGroupCard({ group, now = new Date() }: ArbitraryGroupCardProps): JSX.Element {
  const [open, setOpen] = useState(group.status === "streaming");

  const start = parseTs(group.timeRangeStart);
  const endRef = group.status === "streaming" ? now : parseTs(group.timeRangeEnd);
  const elapsed = formatElapsed(endRef.getTime() - start.getTime());

  const toolLabel = group.toolCount === 0
    ? ""
    : group.toolCount === 1
      ? "1 tool"
      : `${group.toolCount} tools`;

  return (
    <div className={`fm-arbitrary-group fm-arbitrary-group--${group.status}`}>
      <button
        type="button"
        aria-label="toggle group"
        className="fm-arbitrary-group__header"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="fm-arbitrary-group__chevron" aria-hidden>{open ? "▾" : "▸"}</span>
        <span className="fm-arbitrary-group__title">
          {group.participant_id} · {elapsed}
          {toolLabel && <> · {toolLabel}</>}
          {group.status === "streaming" && <span className="fm-arbitrary-group__live"> · live</span>}
        </span>
      </button>
      {open && (
        <div className="fm-arbitrary-group__body">
          {group.items.map((ev) => (
            <EventCard key={ev.filename} event={ev} />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @f-mark/renderer test src/cards/ArbitraryGroupCard.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/renderer/src/cards/ArbitraryGroupCard.tsx packages/renderer/src/cards/ArbitraryGroupCard.test.tsx
git commit -m "feat(renderer): ArbitraryGroupCard with streaming/concluded/ended states"
```

---

### Task 20: Wire projection into the feed

**Files:**
- Modify: the renderer's feed component (find via: `grep -nr "EventCard\b" packages/renderer/src/ --include="*.tsx" | grep -v test`)
- Likely: `packages/renderer/src/feed/Feed.tsx` or `packages/renderer/src/views/SessionView.tsx`

- [ ] **Step 1: Locate the file that maps events → EventCard**

Run: `grep -nrE "events\.map\(.*EventCard|<EventCard\b" packages/renderer/src/ --include="*.tsx"`

Note the file + line. Call it `<FEED_FILE>` below.

- [ ] **Step 2: Write a failing test for the integration**

Create `packages/renderer/src/feed/feedIntegration.test.tsx` (or extend the existing feed test):

```typescript
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Feed } from "./Feed"; // adjust to whatever the feed component path is
import type { AnyEventRecord } from "@f-mark/shared/events";

const evs: AnyEventRecord[] = [
  { filename: "20260523T100000Z_ag-claude.prose.md", timestamp: "20260523T100000Z",
    participant_id: "ag-claude", kind: "prose", payload: { content: "Thinking...", arbitrary: true } },
  { filename: "20260523T100001Z_ag-claude.tool-use.json", timestamp: "20260523T100001Z",
    participant_id: "ag-claude", kind: "tool-use",
    payload: { tool_name: "Bash", tool_use_id: "x", input: {}, success: true } },
  { filename: "20260523T100002Z_ag-claude.prose.md", timestamp: "20260523T100002Z",
    participant_id: "ag-claude", kind: "prose", payload: { content: "Done." } },
];

it("renders an arbitrary group followed by the concluding prose", () => {
  render(<Feed events={evs} />); // adjust prop name
  expect(screen.getByText(/ag-claude/)).toBeInTheDocument();
  expect(screen.getByText("Done.")).toBeInTheDocument();
  // The streaming group should be auto-collapsed since a conclusion exists
  expect(screen.queryByText("Thinking...")).not.toBeInTheDocument();
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm --filter @f-mark/renderer test src/feed/feedIntegration.test.tsx`
Expected: FAIL — "Thinking..." still renders because raw events are mapped 1:1.

- [ ] **Step 4: Update the feed**

In `<FEED_FILE>`, replace the `events.map(...)` with:

```tsx
import { projectFeed } from "./projectFeed";
import { ArbitraryGroupCard } from "../cards/ArbitraryGroupCard";

// inside render:
{projectFeed(events).map((item) =>
  item.type === "group" ? (
    <ArbitraryGroupCard key={`grp-${item.items[0].filename}`} group={item} />
  ) : (
    <EventCard key={item.event.filename} event={item.event} />
  ),
)}
```

- [ ] **Step 5: Run tests**

Run: `pnpm --filter @f-mark/renderer test`
Expected: full renderer suite passes (existing snapshots may need an update — review diff first; if intentional, regenerate with `-u`).

- [ ] **Step 6: Commit**

```bash
git add packages/renderer/src/feed/ packages/renderer/src/cards/
git commit -m "feat(renderer): wire projectFeed + ArbitraryGroupCard into the feed"
```

---

## Phase 6 — Claude Code skill & link flow

### Task 21: Update Claude Code SKILL.md with link + auto-stream instructions

**Files:**
- Modify: `packages/kernel/assets/claude-skill/f-mark/SKILL.md`
- Modify: `packages/kernel/assets/claude-skill/f-mark/api.md`

- [ ] **Step 1: Read the current SKILL.md**

Run: `cat packages/kernel/assets/claude-skill/f-mark/SKILL.md`

- [ ] **Step 2: Rewrite SKILL.md**

Replace the contents with (keeping the YAML frontmatter style intact):

````markdown
---
name: f-mark
description: Use whenever the user is collaborating inside an F-Mark session (presence of a `.f-mark/` directory in cwd, or the user references "the session" / "the document").
---

## Detect
If cwd contains `.f-mark/`, F-Mark is active. Read `.f-mark/AGENT.md` for the up-to-date protocol before doing anything else.

## Bootstrap
1. Read `.f-mark/AGENT.md` once per session.
2. Read `.f-mark/config.json` for the kernel port (default 7777).
3. Read `.f-mark/.token` for the bearer token.
4. Register your participant: `POST /participants/register`. Cache the returned `participant_id`.

## Link into a session
Before producing any output worth logging, pick a session and link to it:

1. `GET /sessions` and choose (newest, named-by-user, or ask via a `choices` event).
2. `POST /agents/<participant_id>/link` with `{ "session_id": "<chosen>" }`.

After linking, the kernel knows where your stream goes.

## Install the auto-stream hook (one-time per project)
Your output is streamed automatically by hooks; you only call the API for *structured* contributions. To enable streaming:

1. Read `.claude/settings.json` (create if missing).
2. Verify it contains an entry under `hooks.Stop` and `hooks.UserPromptSubmit` invoking `npx -y f-mark hook auto-stream <participant_id>` (Stop) and the same command with `--kind user` (UserPromptSubmit). Both hook configs MUST scope the participant_id to *your* registered id, not a placeholder.
3. If absent, add them. Minimal config:

```json
{
  "hooks": {
    "Stop": [{ "hooks": [{ "type": "command",
      "command": "npx -y f-mark hook auto-stream <participant_id>",
      "timeout": 30 }] }],
    "UserPromptSubmit": [{ "hooks": [{ "type": "command",
      "command": "npx -y f-mark hook auto-stream <us-participant-id> --kind user",
      "timeout": 10 }] }]
  }
}
```

4. Tell the user: "I've added the F-Mark auto-stream hook. Restart Claude Code (or run `/exit` and re-launch) so it activates — output will start streaming on the next session."

## What streams automatically
Once the hook is active, every assistant turn flows into the session as:
- mid-turn text → prose with `arbitrary: true`
- tool calls → `tool-use` events
- final text → prose with `arbitrary: false`, followed by `turn-end`

You do NOT POST these manually.

## What you still POST manually
- **Named contributions** (documents, plans): `POST /events/prose` with `name` set.
- **Comments anchored to lines**: `POST /events/prose` with `target: { file, lines }`.
- **Replies**: `POST /events/prose` with `in_reply_to`.
- **Revisions**: `POST /events/prose` with `supersedes`.
- **Todos / choices / file / html**: their dedicated endpoints.

When you POST manually, do NOT set `arbitrary: true` — manual posts are by definition deliberate.

## Revising
POST new prose with `supersedes: <old_filename>`. Works for both auto-streamed and manual posts.

## Don't
- Don't disable the hook to "save tokens" — that's its job.
- Don't write directly into `.f-mark/sessions/...`. Always go through the API.
- Don't fabricate participant_ids.
````

- [ ] **Step 3: Update api.md to document the new endpoints**

Append (after the existing endpoint section):

````markdown
## POST /agents/:participant_id/link

Sets the active session for a participant. The auto-stream hook reads this pointer to know where to POST.

**Request:**
```json
{ "session_id": "2026-05-22-launch-plan" }
```

**Response (200):**
```json
{ "participant_id": "ag-claude", "session_id": "2026-05-22-launch-plan" }
```

Errors: 400 invalid participant_id, 404 session not found, 401 missing/bad token.

## POST /sessions/:id/events/tool-use

Logs a tool invocation. The auto-stream hook emits these automatically; you should only POST directly if writing a custom integration.

**Request:**
```json
{
  "participant_id": "ag-claude",
  "tool_name": "Bash",
  "tool_use_id": "tu_01HXYZ",
  "input": { "command": "ls -la" },
  "result": "total 0\n",
  "success": true,
  "duration_ms": 14
}
```

## POST /sessions/:id/events/prose with `arbitrary`

When set to `true`, the renderer groups the message into the collapsible mid-turn box. The auto-stream hook sets this on every text block except the final one of a turn. Do not set it manually.
````

- [ ] **Step 4: Visual diff review**

Run: `git diff packages/kernel/assets/claude-skill/`

- [ ] **Step 5: Commit**

```bash
git add packages/kernel/assets/claude-skill/
git commit -m "docs(skill): claude-code SKILL.md + api.md for auto-stream + link"
```

---

### Task 22: AGENT.md updates (universal protocol doc)

**Files:**
- Modify: `packages/kernel/assets/AGENT.md`
- Modify: `.f-mark/AGENT.md` (committed copy, if it exists in the repo — keep both in sync)

- [ ] **Step 1: Read both**

Run: `diff packages/kernel/assets/AGENT.md .f-mark/AGENT.md 2>/dev/null || echo "no committed copy"`

- [ ] **Step 2: Add a new section "Auto-stream hooks"**

Append (or insert before "Don't"):

````markdown
## Auto-stream hooks

The kernel exposes a CLI command (`npx -y f-mark hook auto-stream <participant_id>`) that, when wired into your runtime's "turn finished" hook, automatically POSTs:
- intermediate text blocks as `prose` with `arbitrary: true`
- tool calls as `tool-use` events
- the final text block as `prose` with `arbitrary: false`
- `turn-end` after the concluding prose

Runtime-specific install instructions live in each runtime's skill bundle (Claude Code: `.claude/skills/f-mark/`, Codex: `.codex/skills/f-mark/`, Gemini: `.gemini/skills/f-mark/`).

To stream output from a runtime that lacks lifecycle hooks, post mid-turn narration manually with `arbitrary: true` — the renderer treats both paths identically.

## Active session pointer

`POST /agents/<participant_id>/link` records the active session under `.f-mark/agents/<participant_id>/active-session`. The hook reads this file; without it, the hook exits silently with a stderr warning.
````

- [ ] **Step 3: Sync `.f-mark/AGENT.md`**

```bash
cp packages/kernel/assets/AGENT.md .f-mark/AGENT.md
```

- [ ] **Step 4: Commit**

```bash
git add packages/kernel/assets/AGENT.md .f-mark/AGENT.md
git commit -m "docs(agent): describe auto-stream hooks + active session pointer"
```

---

### Task 23: Manual smoke test — Claude Code end-to-end

**Files:**
- None modified; this is a verification task.

- [ ] **Step 1: Build everything**

Run: `pnpm -r build`
Expected: all packages compile.

- [ ] **Step 2: Run the kernel locally against a scratch project**

```bash
cd /tmp
rm -rf fmark-smoke && mkdir fmark-smoke && cd fmark-smoke
git init
node /home/roey/workspace/F-Mark/packages/kernel/dist/cli.js --no-auth --port 7780 &
sleep 1
```

- [ ] **Step 3: Install the Claude skill into the smoke project**

```bash
mkdir -p .claude/skills/f-mark
cp -r /home/roey/workspace/F-Mark/packages/kernel/assets/claude-skill/f-mark/* .claude/skills/f-mark/
```

- [ ] **Step 4: Pre-register a participant + create + link a session via API**

```bash
curl -X POST http://localhost:7780/participants/register \
  -H "Content-Type: application/json" \
  -d '{"label":"Claude","kind":"agent"}'   # capture participant_id

curl -X POST http://localhost:7780/sessions \
  -H "Content-Type: application/json" \
  -d '{"name":"smoke-test"}'   # capture session_id

curl -X POST http://localhost:7780/agents/ag-claude/link \
  -H "Content-Type: application/json" \
  -d '{"session_id":"smoke-test"}'   # use the actual ids
```

- [ ] **Step 5: Install the Stop hook**

Edit `.claude/settings.json` with the snippet from Task 21 (substituting the real participant id).

- [ ] **Step 6: Run a Claude Code session**

Launch Claude Code in `/tmp/fmark-smoke`. Ask it to do something with at least one tool call, e.g. "List the files here and tell me what you see."

- [ ] **Step 7: Verify**

Open the renderer (URL printed at kernel start, e.g. `http://localhost:7780`). Confirm:
- The session shows an arbitrary group containing the mid-turn narration and the `ls` (or `Bash`) tool-use, collapsed.
- Expanding the group shows the prose + the ToolUseCard with input/result.
- The concluding "what I see" reply appears as a normal prose card immediately after the group.
- A turn-end event was recorded (check `.f-mark/sessions/smoke-test/` for `*.turn-end.json`).

- [ ] **Step 8: Cleanup + commit smoke checklist**

```bash
kill %1
cd /home/roey/workspace/F-Mark
```

No code changes — but record success/failure in `docs/superpowers/plans/2026-05-23-auto-stream-hook-smoke.md` for future reference.

```bash
git add docs/superpowers/plans/2026-05-23-auto-stream-hook-smoke.md
git commit -m "docs(plan): record claude-code smoke result"
```

---

## Phase 7 — Codex skill & hook integration

### Task 24: Research Codex hook capability

**Files:**
- Create: `docs/superpowers/plans/2026-05-23-codex-hooks-research.md`

- [ ] **Step 1: Locate authoritative docs**

Run: `gh search repos openai/codex 2>/dev/null || echo "no gh"` then either `gh repo view openai/codex --json description,homepageUrl` or fetch via WebFetch the canonical Codex CLI docs at https://github.com/openai/codex (or the relevant location).

Goal: find documentation for Codex CLI's hook/lifecycle/notification system.

- [ ] **Step 2: Document findings**

In `docs/superpowers/plans/2026-05-23-codex-hooks-research.md`, write:

```markdown
# Codex Hook Research (filled in during execution)

## Configuration file path
- Linux: `~/.codex/config.toml` (verify)
- Project override location: (verify — likely `.codex/config.toml`)

## Available lifecycle hooks
- (List every event Codex fires that we could use: turn-end equivalent, on-tool-call, on-user-input, etc.)
- For each: stdin shape (does it pass the transcript? the final text?), exit-code semantics, timeout.

## Transcript availability
- Does Codex expose a transcript file path? In what format (JSONL, structured)?
- If not, how do we extract the assistant's last turn?

## Mapping to F-Mark
- Stop equivalent: ___ → `npx -y f-mark hook auto-stream <id>`
- UserPromptSubmit equivalent: ___
- If a tool-call-level hook exists, optional optimization: emit `tool-use` events directly instead of post-hoc projection.

## Open questions / blockers
- (If Codex lacks lifecycle hooks at all, document the fallback: skill instructs the model to manually POST with `arbitrary: true`.)
```

- [ ] **Step 3: Commit research**

```bash
git add docs/superpowers/plans/2026-05-23-codex-hooks-research.md
git commit -m "docs(plan): codex hook capability research"
```

---

### Task 25: Codex skill bundle

**Files:**
- Create: `packages/kernel/assets/codex-skill/f-mark/SKILL.md`
- Create: `packages/kernel/assets/codex-skill/f-mark/api.md`

- [ ] **Step 1: Copy the Claude bundle as a starting point**

```bash
mkdir -p packages/kernel/assets/codex-skill/f-mark
cp packages/kernel/assets/claude-skill/f-mark/api.md packages/kernel/assets/codex-skill/f-mark/api.md
```

- [ ] **Step 2: Author Codex-specific SKILL.md**

Create `packages/kernel/assets/codex-skill/f-mark/SKILL.md`. Use the same structure as the Claude bundle but with Codex-specific paths and hook config based on Task 24 research:

````markdown
---
name: f-mark
description: Use whenever the user is collaborating inside an F-Mark session (presence of a `.f-mark/` directory in cwd).
---

## Detect / Bootstrap / Link
(Same as Claude — see api.md.)

## Install the auto-stream hook (Codex-specific)

[Replace the block below with the verified format from `docs/superpowers/plans/2026-05-23-codex-hooks-research.md`.]

Tentative TOML form (verify against actual Codex docs at execution time):

```toml
[[hooks.stop]]
command = "npx"
args = ["-y", "f-mark", "hook", "auto-stream", "<participant_id>"]
timeout_ms = 30000

[[hooks.user_prompt_submit]]
command = "npx"
args = ["-y", "f-mark", "hook", "auto-stream", "<participant_id>", "--kind", "user"]
timeout_ms = 10000
```

Path: `~/.codex/config.toml` (user-level) or `.codex/config.toml` (project-level — prefer project so the hook only applies in F-Mark workspaces).

## Fallback if Codex lacks lifecycle hooks

If hooks aren't available, manually POST mid-turn narration with `arbitrary: true` and the concluding reply with `arbitrary: false`. The renderer behavior is identical.

## What streams / what you still POST manually
(Same as Claude.)
````

- [ ] **Step 3: Tweak api.md for Codex (mostly identical — fix any Claude-specific examples)**

Search/replace the Claude-specific `Claude Code` → `Codex` mentions where appropriate.

- [ ] **Step 4: Commit**

```bash
git add packages/kernel/assets/codex-skill/
git commit -m "feat(skill): codex skill bundle for f-mark auto-stream + manual fallback"
```

---

### Task 26: Codex smoke test (or fallback verification)

- [ ] **Step 1:** Repeat the smoke flow from Task 23 with Codex CLI instead of Claude Code, using the TOML config produced in Task 25.
- [ ] **Step 2:** If hooks fire correctly, confirm the renderer shows the grouped feed identical to Claude's smoke.
- [ ] **Step 3:** If hooks do not exist, verify the manual fallback by running Codex against the SKILL.md and observing whether it POSTs with `arbitrary: true`.
- [ ] **Step 4:** Append findings to `docs/superpowers/plans/2026-05-23-auto-stream-hook-smoke.md` and commit.

---

## Phase 8 — Gemini skill & hook integration

### Task 27: Research Gemini CLI hook capability

**Files:**
- Create: `docs/superpowers/plans/2026-05-23-gemini-hooks-research.md`

- [ ] **Step 1: Locate Gemini CLI docs**

Use WebFetch on the official Gemini CLI documentation. Check whether Gemini CLI supports lifecycle hooks at all (it has an extension system; hooks may live there or not at all).

- [ ] **Step 2: Document findings**

Mirror the structure of `2026-05-23-codex-hooks-research.md`. Be honest: if Gemini CLI has no Stop-equivalent hook, the plan's fallback path becomes the primary integration mode for Gemini.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/plans/2026-05-23-gemini-hooks-research.md
git commit -m "docs(plan): gemini cli hook capability research"
```

---

### Task 28: Gemini skill bundle

**Files:**
- Create: `packages/kernel/assets/gemini-skill/f-mark/SKILL.md`
- Create: `packages/kernel/assets/gemini-skill/f-mark/api.md`

- [ ] **Step 1: Author the bundle**

If hooks exist → mirror Task 25 with Gemini-specific config.
If hooks don't exist → write a skill that:
1. Detects F-Mark
2. Bootstraps + links
3. **Instructs the model itself to mirror its output via the API**: every text segment that wraps a tool call should be POSTed as prose with `arbitrary: true`; each tool call POSTed as a `tool-use` event; the final reply POSTed as `arbitrary: false`; a `turn-end` POSTed at the end.

Example fallback skill body:

````markdown
---
name: f-mark
description: F-Mark collaboration in Gemini CLI.
---

## Bootstrap + Link
(Same as other runtimes.)

## Streaming (manual mode)

Gemini CLI does not currently expose a turn-finished hook, so the model is responsible for streaming:

For each response that involves tool calls:
1. Before invoking a tool, POST the narration text as prose with `arbitrary: true`.
2. Invoke the tool. After it returns, POST a `tool-use` event capturing the tool name, input, output, and success.
3. When you've decided your final answer, POST it as prose with `arbitrary: false`.
4. POST `turn-end`.

For tool-free responses: POST a single prose with `arbitrary: false`, then `turn-end`.

This produces a feed identical to the hook-driven runtimes — the renderer doesn't care which path was used.
````

- [ ] **Step 2: Copy api.md**

```bash
cp packages/kernel/assets/claude-skill/f-mark/api.md packages/kernel/assets/gemini-skill/f-mark/api.md
```

- [ ] **Step 3: Commit**

```bash
git add packages/kernel/assets/gemini-skill/
git commit -m "feat(skill): gemini skill bundle (hook or manual-stream fallback)"
```

---

### Task 29: Gemini smoke test

- [ ] **Step 1–4:** Same smoke pattern as Tasks 23 and 26, against Gemini CLI. Document outcome.

---

## Phase 9 — Polish, docs, and version bump

### Task 30: Update README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Edit the "What's in the renderer" + "How it works" sections**

Add a note under renderer features:

```
- **Mid-turn group** — consecutive arbitrary prose + tool-use events from the same agent collapse into a single expandable card; auto-collapsed once the agent's concluding message arrives.
- **Tool-use cards** — tool invocations render with a per-tool icon and expandable input/output.
```

Add to "Agent integration":

```
Agents stream output automatically once the auto-stream hook is installed. The skill bundle (`assets/<runtime>-skill/f-mark/SKILL.md`) walks each runtime through registering, linking to a session via `POST /agents/:id/link`, and adding the hook entry. After install, the agent only calls the HTTP API for *structured* contributions (named documents, replies, comments, todos, choices).
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs(readme): document auto-stream, tool-use, arbitrary grouping"
```

---

### Task 31: Bump version

**Files:**
- Modify: root `package.json` and any package versions in `packages/*/package.json`

- [ ] **Step 1: Decide version**

The redesign shipped v0.2.0. This adds a new wire protocol field (`arbitrary`), a new event kind (`tool-use`), and a new endpoint (`POST /agents/:id/link`). It's additive, so 0.3.0 is appropriate.

- [ ] **Step 2: Update package.json files**

```bash
# Update root and packages/kernel and packages/renderer and packages/shared
# (use a script or edit each manually for clarity)
```

- [ ] **Step 3: Commit**

```bash
git add package.json packages/*/package.json
git commit -m "chore: 0.3.0 — auto-stream hook + tool-use + arbitrary grouping"
```

---

### Task 32: Final full-suite verification

- [ ] **Step 1:** Run `pnpm -r test`
Expected: every test green.

- [ ] **Step 2:** Run `pnpm -r build`
Expected: every package builds.

- [ ] **Step 3:** Manually inspect `git log --oneline | head -40` to confirm commit chain is coherent.

- [ ] **Step 4:** If everything is green, the plan is complete. Open a PR via the standard process.

---

## Self-Review

**1. Spec coverage:**
- (a) Register auto-hook when linking → Tasks 8 (link endpoint), 21 (Claude SKILL telling agent to install hook), 25 (Codex), 28 (Gemini). ✓
- (b) Filter out noise → Task 10 (`projectTurnToEvents` drops whitespace-only text blocks; empty turns produce zero events). ✓
- (c) New `tool-use` prose type with icon + expandable details → Tasks 1, 3, 4 (schema/serializer/filename), 5 (route), 15 (icons), 16 (card), 17 (dispatch). ✓
- (d) `arbitrary` flag, default false, concluding=false, mid=true, expandable consecutive box with time range + tool count + auto-close → Tasks 2 (schema), 6 (route), 10 (projection logic for concluding vs arbitrary), 18 (group projection), 19 (card with time range + tool count + auto-close). ✓
- (e) Codex + Gemini consideration → Tasks 24–29 (research-first, then per-runtime skill, then smoke). ✓

**2. Placeholder scan:**
- "Replace with the verified format from research" in Task 25 — flagged as TBD, but the deliverable of Task 24 is to fill in those specifics. This is acceptable because the placeholder is bounded: it points to a concrete prior task whose output gets written into this block.
- Same applies to Task 28 for Gemini.
- No other TBD/TODO/"fill in details" placeholders found.

**3. Type consistency:**
- `ProjectedEvent` shape matches `ProsePayload` + `ToolUsePayload` (Tasks 1, 2, 10, 12). ✓
- `AnyEventRecord` extended with `ToolUseEventRecord` in Task 1, consumed by `projectFeed` (Task 18) and `ArbitraryGroupCard` (Task 19). ✓
- `participant_id` shape (`^[a-z][a-z0-9-]{0,63}$`) used consistently in Tasks 7 and 8. ✓
- Time-range fields (`timeRangeStart`, `timeRangeEnd`) defined in `projectFeed` (Task 18), consumed in `ArbitraryGroupCard` (Task 19). ✓
- HTTP shapes from `postProjectedEvents` (Task 12) match the route bodies in Tasks 5 and 6 (`tool_name`, `tool_use_id`, `input`, `result`, `success`, `duration_ms`; `content`, `arbitrary`). ✓
- `runAutoStream(participantId, kind, stdinRaw)` (Task 13) matches CLI invocation (Task 14). ✓

No inconsistencies found.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-23-auto-stream-hook.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. Best for this plan because the phases are well-scoped, each task has clear test gates, and the renderer + kernel work can interleave cleanly.

2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints. Best if you want to watch decisions land in real time and intervene on the Codex/Gemini research.

Which approach?
