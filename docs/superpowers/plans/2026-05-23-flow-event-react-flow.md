# Flow Chart Event (React Flow) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `flow` event kind so agents can output graphs (flowcharts, pipelines, architectures, decision trees) as structured `{ nodes, edges }` JSON. The kernel exposes a dedicated `POST /sessions/:id/events/flow` endpoint; the renderer ships a `FlowCard` that draws the graph with `@xyflow/react`, themed via the existing CSS-variable system. Models are guided (via `AGENT.md` + skill bundles) to prefer this over ASCII art for any non-trivial diagram.

**Architecture:**
- **Schema (shared)** — `flow` becomes a new `EventKind`. `FlowPayload` carries `{ id, title?, nodes[], edges[], supersedes? }`. Nodes can carry `label / title / content / popover{html,css?,js?} / itemType / focused / position`. Edges carry `id / source / target / label? / style? / type?`. Stored as a single `.flow.json` file.
- **Kernel** — new `routes/flow.ts` with strict AJV validation + a custom graph check (unique node ids, edges only reference real nodes). Filename + bus broadcast follow the same pattern as `routes/html.ts` / `routes/todos.ts`. Supersession behaves identically to other event kinds.
- **Renderer** — new `FlowCard.tsx` wraps `@xyflow/react` v12 inside a themed card chrome. Custom node + edge components read `itemType` / `style` / `type` and map them to CSS-variable-driven classes. `dagre` lays out nodes when any node lacks a `position`. A node's `popover` opens a sandboxed iframe (`srcdoc + sandbox="allow-scripts"`) on click — same security model as `EmbedCard`, but inline. `focused: true` centers the viewport on that node and applies a highlight class.
- **Theme adaptation** — no per-theme code; React Flow's default stylesheet is imported once and then overridden with rules that consume `--ink / --user / --green / --rose / --agent / --line / --canvas / --shadow*`. All six themes resolve automatically.
- **Agent docs** — `AGENT.md` + the three per-runtime skill bundles (claude / codex / gemini) get a "Flow chart" section so models know when and how to emit a flow.

**Tech Stack:** `@xyflow/react` v12 (React Flow), `dagre` + `@types/dagre` for layout. Otherwise: TypeScript, React 18, Vitest, Fastify, Zustand — nothing new to the stack.

---

## Decisions & Defaults

These choices are baked into the tasks below. Override before execution if any are wrong.

1. **Event kind name = `flow`.** Single lowercase word, matches existing kinds (`prose`, `choices`, `todo`, `html`). Filename pattern: `<ts>_<pid>.flow.json`. The kind regex in `composeFilename` (`[a-z-]+`) already accepts it; no change there.
2. **Storage = single JSON file**, NOT a folder bundle like `html`. The payload is structured data with no per-node side files — serializing everything inline keeps reads cheap and avoids the html-bundle locking dance in `routes/html.ts`.
3. **React Flow package = `@xyflow/react` v12+**, not the deprecated `reactflow` v11. v12 is the maintained line as of 2026; same maintainer; the import path is the only meaningful API change.
4. **Layout = optional client-side `dagre`** with `rankdir: LR`. If EVERY node has an explicit `position`, dagre is skipped (the model's positions win). If ANY node lacks a `position`, dagre re-lays out the whole graph (mixed-mode means the explicit positions are clobbered — agreed trade-off; models should pick "all or nothing"). Layout runs in the renderer; the kernel stores the payload verbatim.
5. **Popover = sandboxed `srcdoc` iframe.** When `node.popover = { html, css?, js? }`, clicking the node toggles a popover whose body is an `<iframe sandbox="allow-scripts" srcdoc="<assembled html>">`. Same isolation model as `EmbedCard`, but inline — no folder bundle on disk. Models can ship arbitrary CSS/JS without compromising the parent page.
6. **Edge style `flowing` = animated `strokeDashoffset`** via a CSS keyframe (`@keyframes flow-dashflow`). `solid` / `dashed` / `dotted` map to `strokeDasharray` directly. One custom edge component branches on `style`.
7. **Focused node = `focused: true`** on at most one node. On mount, the FlowCard calls React Flow's `fitView({ nodes: [focusedNode], padding: 0.3 })`. The node also gets a `.focused` class (ring shadow + accent color).
8. **Themes = CSS-variable overrides only.** React Flow's stylesheet (`@xyflow/react/dist/style.css`) is imported once in `FlowCard.tsx`. We then override `.react-flow__node`, `.react-flow__edge-path`, `.react-flow__controls-button`, etc., from `cards.css` using the existing tokens. All six themes resolve automatically.
9. **Auth + bus broadcast = identical to other event routes.** `supersedes` works the same way (the renderer's `aggregate` already drops superseded events by filename; no special-casing needed because it reads `payload.supersedes` generically).
10. **No server-side validation of popover HTML/CSS/JS.** The iframe sandbox is the security boundary. The server DOES validate that `nodes[].id` are unique and that `edges[].source` / `edges[].target` reference real node ids — this prevents malformed payloads from corrupting the renderer.
11. **Tests = Vitest** in kernel + renderer. React Flow needs `ResizeObserver` and `DOMMatrixReadOnly` shims in jsdom, plus a `getBoundingClientRect` floor; we add them to `tests/setup.ts` once (and only for the renderer package).
12. **Tile dimensions = `--flow-card-h: 360px` default** (defined in `cards.css` `:root` so it applies across themes/densities; tweakable later via density overrides if needed). The card chrome (head + title + canvas) mirrors `EmbedCard`'s shape.
13. **Item types** map to a border + fill pair from existing tokens:
    - `default` → `--line-2` border, `--canvas` fill
    - `info` → `--user` border, `--user-tint` fill
    - `success` → `--green` border, `--green-tint` fill
    - `danger` → `--rose` border, `--user-tint` fill (rose-tint isn't defined; user-tint with rose border reads as "alert" in every theme)
    - `disabled` → `--ink-4` border, `--panel-2` fill, `opacity: 0.6`
14. **Document view inclusion.** A flow chart is a deliberate, durable contribution — it belongs in the Document view alongside named prose. We add `e.kind === "flow"` to `aggregate.ts`'s `feedDocument` filter. (Conversation view stays prose-only.)

---

## File Structure

**New files:**
- `packages/kernel/src/routes/flow.ts` — POST /sessions/:id/events/flow
- `packages/kernel/tests/routes/flow.test.ts` — route tests
- `packages/renderer/src/cards/FlowCard.tsx` — top-level card
- `packages/renderer/src/cards/flow/FlowNode.tsx` — custom React Flow node
- `packages/renderer/src/cards/flow/FlowEdge.tsx` — custom React Flow edge
- `packages/renderer/src/cards/flow/layoutFlow.ts` — dagre wrapper (pure function)
- `packages/renderer/src/cards/flow/layoutFlow.test.ts` — layout tests
- `packages/renderer/src/cards/flow/popover.ts` — srcdoc HTML assembler (pure function)
- `packages/renderer/src/cards/flow/popover.test.ts` — assembler tests
- `packages/renderer/tests/cards/flow.test.tsx` — FlowCard render tests

**Modified files:**
- `packages/shared/src/events.ts` — add `flow` kind + `Flow*` types
- `packages/kernel/src/server.ts` — register flow route
- `packages/renderer/src/cards/EventCard.tsx` — dispatch `flow` → `FlowCard`
- `packages/renderer/src/cards/cards.css` — add `.flow-card` + React Flow overrides
- `packages/renderer/src/state/aggregate.ts` — include `flow` in `feedDocument`
- `packages/renderer/src/feed/projectFeed.test.ts` (or create) — regression test for `flow` as standalone item
- `packages/renderer/src/api/client.ts` — add `postFlow`
- `packages/renderer/tests/setup.ts` — ResizeObserver + DOMMatrixReadOnly shims, getBoundingClientRect floor
- `packages/renderer/package.json` + `pnpm-lock.yaml` — add `@xyflow/react`, `dagre`, `@types/dagre`
- `packages/kernel/assets/AGENT.md` — document flow event
- `packages/kernel/assets/claude-skill/f-mark/api.md` — flow endpoint reference
- `packages/kernel/assets/claude-skill/f-mark/SKILL.md` — "use flow over ASCII" note
- `packages/kernel/assets/codex-skill/f-mark/api.md` — same as claude
- `packages/kernel/assets/codex-skill/f-mark/SKILL.md` — same as claude
- `packages/kernel/assets/gemini-skill/f-mark/api.md` — same as claude
- `packages/kernel/assets/gemini-skill/f-mark/SKILL.md` — same as claude

---

## Phase 1 — Shared schema

### Task 1: Add `flow` event kind + Flow types to shared

**Files:**
- Modify: `packages/shared/src/events.ts:1-146`

- [ ] **Step 1: Extend `EventKind`**

In `packages/shared/src/events.ts:1-9`, change the union to add `"flow"`:

```typescript
export type EventKind =
  | "prose"
  | "choices"
  | "choice"
  | "turn-end"
  | "todo"
  | "html"
  | "file"
  | "tool-use"
  | "flow";
```

- [ ] **Step 2: Append Flow payload types**

After the `ToolUseEventRecord` declaration (around line 135), append:

```typescript
export type FlowItemType =
  | "default"
  | "info"
  | "success"
  | "danger"
  | "disabled";

export type FlowEdgeStyle = "solid" | "dashed" | "dotted" | "flowing";
export type FlowEdgeType = "default" | "info" | "success" | "danger";

export interface FlowNodePopover {
  html: string;
  css?: string;
  js?: string;
}

export interface FlowNode {
  id: string;
  label: string;
  title?: string;
  content?: string;
  popover?: FlowNodePopover;
  itemType?: FlowItemType;
  focused?: boolean;
  /** Optional explicit position. If omitted on ANY node, the renderer runs dagre. */
  position?: { x: number; y: number };
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  style?: FlowEdgeStyle;
  type?: FlowEdgeType;
}

export interface FlowPayload {
  /** Stable id used by `supersedes` for revisions. */
  id: string;
  title?: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  supersedes?: string;
}

export interface FlowEventRecord extends EventRecord<FlowPayload> {
  kind: "flow";
}
```

- [ ] **Step 3: Add `FlowEventRecord` to `AnyEventRecord`**

In `packages/shared/src/events.ts:137-146`, update the union:

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
  | FlowEventRecord
  | EventRecord;
```

- [ ] **Step 4: Rebuild shared so kernel + renderer see the new types**

Run:

```bash
pnpm --filter @f-mark/shared build
```

Expected: clean exit. (Per the workspace conventions memory: shared resolves to `dist/`, so this rebuild is mandatory before kernel/renderer can reference the new types.)

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/events.ts packages/shared/dist
git commit -m "feat(shared): add flow event kind + Flow{Node,Edge,Payload} types"
```

---

## Phase 2 — Kernel route

### Task 2: POST /sessions/:id/events/flow

**Files:**
- Create: `packages/kernel/src/routes/flow.ts`
- Create: `packages/kernel/tests/routes/flow.test.ts`
- Modify: `packages/kernel/src/server.ts:1-160`

- [ ] **Step 1: Write the failing route tests**

Create `packages/kernel/tests/routes/flow.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createServer } from "../../src/server.js";
import { initProject } from "../../src/project.js";
import { paths } from "../../src/paths.js";
import { createSession } from "../../src/sessions.js";
import { listParticipants } from "../../src/participants.js";
import { withTempProject } from "../helpers/tempdir.js";

async function setup(root: string) {
  const p = paths(root);
  await initProject(p);
  const session = await createSession(p, { slug: "x" });
  const [pid] = Object.keys(await listParticipants(p));
  const { app } = createServer({ token: null, paths: p });
  return { p, app, sessionId: session.id, pid: pid! };
}

const validPayload = {
  id: "fl_1",
  title: "Pipeline",
  nodes: [
    { id: "n1", label: "Input", itemType: "info", position: { x: 0, y: 0 } },
    { id: "n2", label: "Process", itemType: "default", position: { x: 200, y: 0 } },
    {
      id: "n3",
      label: "Done",
      itemType: "success",
      focused: true,
      position: { x: 400, y: 0 },
    },
  ],
  edges: [
    { id: "e1", source: "n1", target: "n2", style: "solid", type: "default" },
    { id: "e2", source: "n2", target: "n3", style: "flowing", type: "success" },
  ],
};

describe("POST /sessions/:id/events/flow", () => {
  it("writes a .flow.json file with the payload", async () => {
    await withTempProject(async (root) => {
      const { p, app, sessionId, pid } = await setup(root);
      const res = await app.inject({
        method: "POST",
        url: `/sessions/${sessionId}/events/flow`,
        payload: { participant_id: pid, ...validPayload },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.filename).toMatch(/\.flow\.json$/);
      expect(body.kind).toBe("flow");

      const file = await readFile(
        join(p.sessionDir(sessionId), body.filename),
        "utf8",
      );
      const parsed = JSON.parse(file);
      expect(parsed.id).toBe("fl_1");
      expect(parsed.nodes).toHaveLength(3);
      expect(parsed.edges).toHaveLength(2);
      await app.close();
    });
  });

  it("returns 400 if a node lacks an id", async () => {
    await withTempProject(async (root) => {
      const { app, sessionId, pid } = await setup(root);
      const res = await app.inject({
        method: "POST",
        url: `/sessions/${sessionId}/events/flow`,
        payload: {
          participant_id: pid,
          id: "fl_2",
          nodes: [{ label: "no id" }],
          edges: [],
        },
      });
      expect(res.statusCode).toBe(400);
      await app.close();
    });
  });

  it("returns 400 if an edge references a missing node", async () => {
    await withTempProject(async (root) => {
      const { app, sessionId, pid } = await setup(root);
      const res = await app.inject({
        method: "POST",
        url: `/sessions/${sessionId}/events/flow`,
        payload: {
          participant_id: pid,
          id: "fl_3",
          nodes: [{ id: "n1", label: "A" }],
          edges: [{ id: "e1", source: "n1", target: "n-missing" }],
        },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toMatch(/edge.*references.*n-missing/i);
      await app.close();
    });
  });

  it("returns 400 if node ids are not unique", async () => {
    await withTempProject(async (root) => {
      const { app, sessionId, pid } = await setup(root);
      const res = await app.inject({
        method: "POST",
        url: `/sessions/${sessionId}/events/flow`,
        payload: {
          participant_id: pid,
          id: "fl_4",
          nodes: [
            { id: "n1", label: "A" },
            { id: "n1", label: "B" },
          ],
          edges: [],
        },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toMatch(/duplicate.*node.*id/i);
      await app.close();
    });
  });

  it("returns 404 on missing session", async () => {
    await withTempProject(async (root) => {
      const { app, pid } = await setup(root);
      const res = await app.inject({
        method: "POST",
        url: `/sessions/no-such/events/flow`,
        payload: { participant_id: pid, ...validPayload },
      });
      expect(res.statusCode).toBe(404);
      await app.close();
    });
  });

  it("accepts supersedes on a follow-up flow with the same id", async () => {
    await withTempProject(async (root) => {
      const { app, sessionId, pid } = await setup(root);
      const first = await app.inject({
        method: "POST",
        url: `/sessions/${sessionId}/events/flow`,
        payload: { participant_id: pid, ...validPayload },
      });
      const firstFilename = first.json().filename as string;

      const second = await app.inject({
        method: "POST",
        url: `/sessions/${sessionId}/events/flow`,
        payload: {
          participant_id: pid,
          ...validPayload,
          supersedes: firstFilename,
        },
      });
      expect(second.statusCode).toBe(200);
      const body = second.json();
      expect(body.filename).not.toBe(firstFilename);
      // The new file exists on disk under the session folder.
      const file = await readFile(
        join(p.sessionDir(sessionId), body.filename as string),
        "utf8",
      );
      expect(JSON.parse(file).supersedes).toBe(firstFilename);
      await app.close();
    });
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm --filter f-mark test -- --run tests/routes/flow.test.ts
```

Expected: all 6 tests fail — the route doesn't exist yet so every POST returns 404 (and the validation/error-shape tests trip on that).

- [ ] **Step 3: Create the route handler**

Create `packages/kernel/src/routes/flow.ts`:

```typescript
import type { FastifyInstance, FastifyReply } from "fastify";
import type {
  EventKind,
  FlowEdge,
  FlowNode,
  FlowPayload,
} from "@f-mark/shared";
import type { Paths } from "../paths.js";
import { sessionExists } from "../sessions.js";
import { writeEventFile } from "../events/writer.js";
import type { Bus, BusMessage } from "../ws/bus.js";

interface FlowBody extends FlowPayload {
  participant_id: string;
}

async function ensureSession(
  p: Paths,
  sessionId: string,
  reply: FastifyReply,
): Promise<boolean> {
  if (!(await sessionExists(p, sessionId))) {
    reply.code(404).send({ error: `session not found: ${sessionId}` });
    return false;
  }
  return true;
}

function validateGraph(nodes: FlowNode[], edges: FlowEdge[]): void {
  const ids = new Set<string>();
  for (const n of nodes) {
    if (ids.has(n.id)) {
      throw new Error(`duplicate node id: ${n.id}`);
    }
    ids.add(n.id);
  }
  for (const e of edges) {
    if (!ids.has(e.source)) {
      throw new Error(`edge ${e.id} references missing node: ${e.source}`);
    }
    if (!ids.has(e.target)) {
      throw new Error(`edge ${e.id} references missing node: ${e.target}`);
    }
  }
}

export function registerFlowRoutes(
  app: FastifyInstance,
  p: Paths,
  getBus: () => Bus,
): void {
  function publish(
    sessionId: string,
    filename: string,
    kind: EventKind,
    participantId: string,
    supersedes?: string,
  ): void {
    const bus = getBus();
    const added: BusMessage = {
      type: "event_added",
      session_id: sessionId,
      filename,
      kind,
      participant_id: participantId,
    };
    bus.publish(added);
    if (typeof supersedes === "string") {
      bus.publish({
        type: "event_superseded",
        session_id: sessionId,
        filename: supersedes,
        supersedes: filename,
      });
    }
  }

  app.post<{ Params: { id: string }; Body: FlowBody }>(
    "/sessions/:id/events/flow",
    {
      schema: {
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string" } },
        },
        body: {
          type: "object",
          required: ["participant_id", "id", "nodes", "edges"],
          properties: {
            participant_id: { type: "string", minLength: 1 },
            id: { type: "string", minLength: 1 },
            title: { type: "string" },
            supersedes: { type: "string" },
            nodes: {
              type: "array",
              items: {
                type: "object",
                required: ["id", "label"],
                properties: {
                  id: { type: "string", minLength: 1 },
                  label: { type: "string" },
                  title: { type: "string" },
                  content: { type: "string" },
                  popover: {
                    type: "object",
                    required: ["html"],
                    properties: {
                      html: { type: "string" },
                      css: { type: "string" },
                      js: { type: "string" },
                    },
                  },
                  itemType: {
                    type: "string",
                    enum: ["default", "info", "success", "danger", "disabled"],
                  },
                  // `enum: [true, false]` matches the same strict-boolean trick
                  // used in routes/events.ts for prose `arbitrary` — avoids
                  // Fastify/AJV's default-coercion behavior.
                  focused: { enum: [true, false] },
                  position: {
                    type: "object",
                    required: ["x", "y"],
                    properties: {
                      x: { type: "number" },
                      y: { type: "number" },
                    },
                  },
                },
              },
            },
            edges: {
              type: "array",
              items: {
                type: "object",
                required: ["id", "source", "target"],
                properties: {
                  id: { type: "string", minLength: 1 },
                  source: { type: "string", minLength: 1 },
                  target: { type: "string", minLength: 1 },
                  label: { type: "string" },
                  style: {
                    type: "string",
                    enum: ["solid", "dashed", "dotted", "flowing"],
                  },
                  type: {
                    type: "string",
                    enum: ["default", "info", "success", "danger"],
                  },
                },
              },
            },
          },
        },
      },
    },
    async (req, reply) => {
      if (!(await ensureSession(p, req.params.id, reply))) return;
      try {
        const { participant_id, supersedes, ...rest } = req.body;
        const payload: FlowPayload =
          supersedes !== undefined ? { ...rest, supersedes } : rest;
        validateGraph(payload.nodes, payload.edges);
        const filename = await writeEventFile(p, req.params.id, {
          participant_id,
          kind: "flow",
          ext: "json",
          contents: JSON.stringify(payload, null, 2),
        });
        publish(req.params.id, filename, "flow", participant_id, supersedes);
        return {
          filename,
          timestamp: filename.split("_")[0]!,
          participant_id,
          kind: "flow" as const,
        };
      } catch (err) {
        reply.code(400);
        return { error: err instanceof Error ? err.message : String(err) };
      }
    },
  );
}
```

- [ ] **Step 4: Register the route in `server.ts`**

In `packages/kernel/src/server.ts`, add the import next to `registerHtmlRoutes` (around line 13):

```typescript
import { registerFlowRoutes } from "./routes/flow.js";
```

And add the registration call after `registerHtmlRoutes(...)` (around line 155):

```typescript
registerFlowRoutes(app, deps.paths, () => busRef);
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
pnpm --filter f-mark test -- --run tests/routes/flow.test.ts
```

Expected: 6 passes.

- [ ] **Step 6: Run full kernel suite to confirm no regressions**

```bash
pnpm --filter f-mark test
```

Expected: green; total count = previous baseline + 6 (flow tests).

- [ ] **Step 7: Commit**

```bash
git add packages/kernel/src/routes/flow.ts \
        packages/kernel/tests/routes/flow.test.ts \
        packages/kernel/src/server.ts
git commit -m "feat(kernel): POST /sessions/:id/events/flow with validation + bus broadcast"
```

---

## Phase 3 — Renderer deps + API client

### Task 3: Install @xyflow/react + dagre

**Files:**
- Modify: `packages/renderer/package.json`
- Modify: `pnpm-lock.yaml` (auto)

- [ ] **Step 1: Install runtime deps**

```bash
pnpm --filter @f-mark/renderer add @xyflow/react dagre
```

Expected: `package.json` gains `@xyflow/react` (v12.x) and `dagre` (v0.8.x or current). `pnpm-lock.yaml` updates.

- [ ] **Step 2: Install dagre types**

```bash
pnpm --filter @f-mark/renderer add -D @types/dagre
```

- [ ] **Step 3: Sanity check the import resolves**

```bash
node -e "import('@xyflow/react').then(m => console.log(typeof m.ReactFlow))"
```

Expected: `function`.

- [ ] **Step 4: Commit**

```bash
git add packages/renderer/package.json pnpm-lock.yaml
git commit -m "chore(renderer): add @xyflow/react + dagre + @types/dagre"
```

### Task 4: Add `postFlow` to the API client

**Files:**
- Modify: `packages/renderer/src/api/client.ts:1-285`

- [ ] **Step 1: Add the body type**

In `packages/renderer/src/api/client.ts`, after `PostHtmlBody` (around line 64), append:

```typescript
export interface PostFlowBody {
  participant_id: string;
  id: string;
  title?: string;
  nodes: import("@f-mark/shared").FlowNode[];
  edges: import("@f-mark/shared").FlowEdge[];
  supersedes?: string;
}
```

- [ ] **Step 2: Add the method to the `Client` interface**

In the `Client` interface (around line 115, after `postHtml`):

```typescript
postFlow(sessionId: string, body: PostFlowBody): Promise<{ filename: string }>;
```

- [ ] **Step 3: Implement in `createClient`**

In `createClient`'s return object, after the `postHtml` implementation:

```typescript
async postFlow(sessionId, body) {
  return (await post(
    `/sessions/${sessionId}/events/flow`,
    body,
  )) as { filename: string };
},
```

- [ ] **Step 4: Typecheck**

```bash
pnpm --filter @f-mark/renderer exec tsc --noEmit
```

Expected: no new type errors.

- [ ] **Step 5: Commit**

```bash
git add packages/renderer/src/api/client.ts
git commit -m "feat(renderer/api): add postFlow client method"
```

---

## Phase 4 — Flow rendering primitives

### Task 5: Layout helper (dagre wrapper, pure)

**Files:**
- Create: `packages/renderer/src/cards/flow/layoutFlow.ts`
- Create: `packages/renderer/src/cards/flow/layoutFlow.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/renderer/src/cards/flow/layoutFlow.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import type { FlowNode, FlowEdge } from "@f-mark/shared";
import { layoutFlow } from "./layoutFlow";

describe("layoutFlow", () => {
  it("assigns positions to nodes that lack one", () => {
    const nodes: FlowNode[] = [
      { id: "a", label: "A" },
      { id: "b", label: "B" },
    ];
    const edges: FlowEdge[] = [{ id: "e1", source: "a", target: "b" }];
    const out = layoutFlow(nodes, edges);
    expect(out[0]!.position).toBeDefined();
    expect(out[1]!.position).toBeDefined();
    // LR dagre layout places b to the right of a.
    expect(out[1]!.position!.x).toBeGreaterThan(out[0]!.position!.x);
  });

  it("preserves explicit positions when ALL nodes have one", () => {
    const nodes: FlowNode[] = [
      { id: "a", label: "A", position: { x: 10, y: 20 } },
      { id: "b", label: "B", position: { x: 100, y: 200 } },
    ];
    const out = layoutFlow(nodes, []);
    expect(out[0]!.position).toEqual({ x: 10, y: 20 });
    expect(out[1]!.position).toEqual({ x: 100, y: 200 });
  });

  it("runs layout when ANY node lacks a position (mixed-mode means dagre wins)", () => {
    const nodes: FlowNode[] = [
      { id: "a", label: "A", position: { x: 999, y: 999 } },
      { id: "b", label: "B" }, // missing
    ];
    const out = layoutFlow(nodes, []);
    expect(out[0]!.position).toBeDefined();
    expect(out[1]!.position).toBeDefined();
    // Explicit pos was NOT preserved in mixed-mode.
    expect(out[0]!.position).not.toEqual({ x: 999, y: 999 });
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
pnpm --filter @f-mark/renderer test -- --run src/cards/flow/layoutFlow.test.ts
```

Expected: "Cannot find module './layoutFlow'".

- [ ] **Step 3: Implement `layoutFlow`**

Create `packages/renderer/src/cards/flow/layoutFlow.ts`:

```typescript
import dagre from "dagre";
import type { FlowNode, FlowEdge } from "@f-mark/shared";

const NODE_W = 160;
const NODE_H = 56;

export function layoutFlow(
  nodes: FlowNode[],
  edges: FlowEdge[],
): FlowNode[] {
  const allPositioned = nodes.every((n) => n.position !== undefined);
  if (allPositioned) return nodes;

  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "LR", nodesep: 40, ranksep: 80 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const n of nodes) g.setNode(n.id, { width: NODE_W, height: NODE_H });
  for (const e of edges) g.setEdge(e.source, e.target);
  dagre.layout(g);

  return nodes.map((n) => {
    const { x, y } = g.node(n.id);
    // dagre returns the CENTER; React Flow wants the top-left corner.
    return { ...n, position: { x: x - NODE_W / 2, y: y - NODE_H / 2 } };
  });
}
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
pnpm --filter @f-mark/renderer test -- --run src/cards/flow/layoutFlow.test.ts
```

Expected: 3 passes.

- [ ] **Step 5: Commit**

```bash
git add packages/renderer/src/cards/flow/layoutFlow.ts \
        packages/renderer/src/cards/flow/layoutFlow.test.ts
git commit -m "feat(renderer/flow): dagre LR layout helper for nodes without explicit positions"
```

### Task 6: Popover `srcdoc` assembler (pure)

**Files:**
- Create: `packages/renderer/src/cards/flow/popover.ts`
- Create: `packages/renderer/src/cards/flow/popover.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/renderer/src/cards/flow/popover.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { assemblePopoverSrcdoc } from "./popover";

describe("assemblePopoverSrcdoc", () => {
  it("returns a full HTML doc when only html is provided", () => {
    const out = assemblePopoverSrcdoc({ html: "<p>hi</p>" });
    expect(out).toContain("<!doctype html>");
    expect(out).toContain("<p>hi</p>");
    expect(out).not.toContain("<script>");
  });

  it("inlines css inside <style>", () => {
    const out = assemblePopoverSrcdoc({
      html: "<p>x</p>",
      css: "p{color:red}",
    });
    expect(out).toMatch(/<style>[\s\S]*p\{color:red\}[\s\S]*<\/style>/);
  });

  it("inlines js inside <script>", () => {
    const out = assemblePopoverSrcdoc({
      html: "<button>x</button>",
      js: "console.log('go')",
    });
    expect(out).toMatch(/<script>[\s\S]*console\.log\('go'\)[\s\S]*<\/script>/);
  });

  it("includes a base style block so popovers without css still look like F-Mark", () => {
    const out = assemblePopoverSrcdoc({ html: "<p>x</p>" });
    expect(out).toContain("font-family: system-ui");
    expect(out).toContain("color: #1a1714");
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
pnpm --filter @f-mark/renderer test -- --run src/cards/flow/popover.test.ts
```

Expected: module-not-found.

- [ ] **Step 3: Implement `assemblePopoverSrcdoc`**

Create `packages/renderer/src/cards/flow/popover.ts`:

```typescript
import type { FlowNodePopover } from "@f-mark/shared";

// The iframe is sandboxed and isolated from the host page, so its baseline
// styles can't inherit from F-Mark's CSS variables. We hand-roll a tiny base
// so popovers without explicit css still look like F-Mark (light ink color,
// system font, 12px padding) — matching the Default theme. Models that want
// theme-aware popovers can override these in their own css block.
const BASE_STYLE = [
  "html,body{margin:0;padding:12px;font-family:system-ui,sans-serif;",
  "color:#1a1714;font-size:13px;line-height:1.5;}",
  "*{box-sizing:border-box;}",
].join("");

export function assemblePopoverSrcdoc(p: FlowNodePopover): string {
  const css =
    p.css !== undefined && p.css.length > 0 ? `<style>${p.css}</style>` : "";
  const js =
    p.js !== undefined && p.js.length > 0 ? `<script>${p.js}</script>` : "";
  return [
    "<!doctype html>",
    "<html><head>",
    `<style>${BASE_STYLE}</style>`,
    css,
    "</head><body>",
    p.html,
    js,
    "</body></html>",
  ].join("");
}
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
pnpm --filter @f-mark/renderer test -- --run src/cards/flow/popover.test.ts
```

Expected: 4 passes.

- [ ] **Step 5: Commit**

```bash
git add packages/renderer/src/cards/flow/popover.ts \
        packages/renderer/src/cards/flow/popover.test.ts
git commit -m "feat(renderer/flow): srcdoc popover assembler with base style"
```

### Task 7: Custom `FlowNode` component

**Files:**
- Create: `packages/renderer/src/cards/flow/FlowNode.tsx`

- [ ] **Step 1: Implement `FlowNode`**

Create `packages/renderer/src/cards/flow/FlowNode.tsx`:

```typescript
import { type JSX, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { FlowNode as FlowNodeData } from "@f-mark/shared";
import { assemblePopoverSrcdoc } from "./popover.js";

interface NodeData {
  data: FlowNodeData;
}

export function FlowNode({ data }: NodeProps<NodeData>): JSX.Element {
  const [open, setOpen] = useState(false);
  const n = data.data;
  const type = n.itemType ?? "default";
  const classes = [
    "flow-node",
    `flow-node-${type}`,
    n.focused === true ? "focused" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={classes}
      onClick={() => {
        if (n.popover !== undefined) setOpen((v) => !v);
      }}
      data-clickable={n.popover !== undefined ? "true" : "false"}
    >
      <Handle type="target" position={Position.Left} className="flow-handle" />
      <div className="flow-node-label">{n.label}</div>
      {n.title !== undefined && n.title.length > 0 && (
        <div className="flow-node-title">{n.title}</div>
      )}
      {n.content !== undefined && n.content.length > 0 && (
        <div className="flow-node-content">{n.content}</div>
      )}
      <Handle type="source" position={Position.Right} className="flow-handle" />
      {n.popover !== undefined && open && (
        <div className="flow-popover" onClick={(e) => e.stopPropagation()}>
          <iframe
            title={`${n.label} popover`}
            srcDoc={assemblePopoverSrcdoc(n.popover)}
            sandbox="allow-scripts"
          />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @f-mark/renderer exec tsc --noEmit
```

Expected: no type errors. (Runtime behavior is exercised by the FlowCard tests in Task 9.)

- [ ] **Step 3: Commit**

```bash
git add packages/renderer/src/cards/flow/FlowNode.tsx
git commit -m "feat(renderer/flow): FlowNode custom node with handles + popover toggle"
```

### Task 8: Custom `FlowEdge` component

**Files:**
- Create: `packages/renderer/src/cards/flow/FlowEdge.tsx`

- [ ] **Step 1: Implement `FlowEdge`**

Create `packages/renderer/src/cards/flow/FlowEdge.tsx`:

```typescript
import { type JSX } from "react";
import { BaseEdge, getBezierPath, type EdgeProps } from "@xyflow/react";
import type { FlowEdge as FlowEdgeData, FlowEdgeStyle } from "@f-mark/shared";

interface EdgeData {
  data: FlowEdgeData;
}

function dashFor(style: FlowEdgeStyle | undefined): string | undefined {
  if (style === "dashed") return "8 4";
  if (style === "dotted") return "2 4";
  if (style === "flowing") return "6 4";
  return undefined;
}

export function FlowEdge(props: EdgeProps<EdgeData>): JSX.Element {
  const {
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    data,
    id,
  } = props;
  const e = data?.data;
  const [path] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });
  const type = e?.type ?? "default";
  const style = e?.style ?? "solid";
  const dash = dashFor(style);
  const className = [
    "flow-edge",
    `flow-edge-${type}`,
    style === "flowing" ? "flowing" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const edgeStyle =
    dash !== undefined ? { strokeDasharray: dash } : undefined;

  return (
    <BaseEdge id={id} path={path} className={className} style={edgeStyle} />
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @f-mark/renderer exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/renderer/src/cards/flow/FlowEdge.tsx
git commit -m "feat(renderer/flow): FlowEdge custom bezier edge with style + type variants"
```

### Task 9: `FlowCard` + tests + jsdom shims

**Files:**
- Modify: `packages/renderer/tests/setup.ts:1-2`
- Create: `packages/renderer/src/cards/FlowCard.tsx`
- Create: `packages/renderer/tests/cards/flow.test.tsx`

- [ ] **Step 1: Extend `tests/setup.ts` with React Flow shims**

Replace `packages/renderer/tests/setup.ts` contents with:

```typescript
import "@testing-library/jest-dom/vitest";

// React Flow uses ResizeObserver + DOMMatrixReadOnly + getBoundingClientRect.
// jsdom either omits them or returns zeros. Provide minimal shims so
// FlowCard tests can render the graph without crashing.

class ResizeObserverShim {
  observe(): void {
    /* noop */
  }
  unobserve(): void {
    /* noop */
  }
  disconnect(): void {
    /* noop */
  }
}
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver =
    ResizeObserverShim as unknown as typeof ResizeObserver;
}

if (typeof globalThis.DOMMatrixReadOnly === "undefined") {
  class DOMMatrixReadOnlyShim {
    m22 = 1;
    constructor(_v?: string | number[]) {
      /* noop */
    }
  }
  // @ts-expect-error jsdom missing constructor
  globalThis.DOMMatrixReadOnly = DOMMatrixReadOnlyShim;
}

// React Flow measures the viewport via getBoundingClientRect; jsdom returns
// zeros which makes the graph collapse to 0x0 and nodes never render. Floor
// any zero-area rect to 200x100 — large enough for React Flow to lay nodes
// out and for testing-library to find their text.
if (
  typeof Element !== "undefined" &&
  typeof Element.prototype.getBoundingClientRect === "function"
) {
  const original = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function (): DOMRect {
    const r = original.call(this);
    if (r.width === 0 && r.height === 0) {
      return {
        ...r,
        width: 200,
        height: 100,
        right: 200,
        bottom: 100,
        toJSON() {
          return r;
        },
      } as DOMRect;
    }
    return r;
  };
}
```

- [ ] **Step 2: Write the failing FlowCard test**

Create `packages/renderer/tests/cards/flow.test.tsx`:

```typescript
import { afterEach, describe, it, expect } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { FlowCard } from "../../src/cards/FlowCard";
import type { FlowEventRecord, Participant } from "@f-mark/shared";

const participants: Record<string, Participant> = {
  "ag-claude": {
    id: "ag-claude",
    kind: "agent",
    name: "Claude",
    color: "#b86a1f",
  },
};

function makeEvent(
  over: Partial<FlowEventRecord["payload"]> = {},
): FlowEventRecord {
  return {
    filename: "20260523T100000Z_ag-claude.flow.json",
    timestamp: "20260523T100000Z",
    participant_id: "ag-claude",
    kind: "flow",
    payload: {
      id: "fl_demo",
      title: "Demo",
      nodes: [
        {
          id: "a",
          label: "Alpha",
          itemType: "info",
          position: { x: 0, y: 0 },
        },
        {
          id: "b",
          label: "Beta",
          itemType: "success",
          position: { x: 200, y: 0 },
        },
      ],
      edges: [
        {
          id: "e1",
          source: "a",
          target: "b",
          style: "solid",
          type: "default",
        },
      ],
      ...over,
    },
  };
}

describe("<FlowCard>", () => {
  afterEach(() => cleanup());

  it("renders the node labels", () => {
    render(<FlowCard event={makeEvent()} participants={participants} />);
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
  });

  it("renders the flow title in the card head", () => {
    render(<FlowCard event={makeEvent()} participants={participants} />);
    expect(screen.getByText("Demo")).toBeInTheDocument();
  });

  it("applies the itemType class to nodes", () => {
    const { container } = render(
      <FlowCard event={makeEvent()} participants={participants} />,
    );
    expect(container.querySelector(".flow-node-info")).not.toBeNull();
    expect(container.querySelector(".flow-node-success")).not.toBeNull();
  });

  it("marks a focused node with the focused class", () => {
    const { container } = render(
      <FlowCard
        event={makeEvent({
          nodes: [
            {
              id: "a",
              label: "Alpha",
              focused: true,
              position: { x: 0, y: 0 },
            },
            { id: "b", label: "Beta", position: { x: 200, y: 0 } },
          ],
        })}
        participants={participants}
      />,
    );
    const focused = container.querySelector(".flow-node.focused");
    expect(focused).not.toBeNull();
    expect(focused?.textContent).toContain("Alpha");
  });

  it("opens a sandboxed iframe popover when a popover-bearing node is clicked", () => {
    const { container } = render(
      <FlowCard
        event={makeEvent({
          nodes: [
            {
              id: "a",
              label: "Alpha",
              position: { x: 0, y: 0 },
              popover: { html: "<p>inside popover</p>" },
            },
          ],
          edges: [],
        })}
        participants={participants}
      />,
    );
    expect(container.querySelector(".flow-popover")).toBeNull();
    fireEvent.click(screen.getByText("Alpha"));
    const iframe = container.querySelector(".flow-popover iframe");
    expect(iframe).not.toBeNull();
    expect(iframe?.getAttribute("sandbox")).toBe("allow-scripts");
    expect(iframe?.getAttribute("srcdoc")).toContain("inside popover");
  });
});
```

- [ ] **Step 3: Run the test to confirm it fails**

```bash
pnpm --filter @f-mark/renderer test -- --run tests/cards/flow.test.tsx
```

Expected: "Cannot find module 'FlowCard'".

- [ ] **Step 4: Implement `FlowCard`**

Create `packages/renderer/src/cards/FlowCard.tsx`:

```typescript
import { useMemo, type JSX } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  useReactFlow,
  type Node as RfNode,
  type Edge as RfEdge,
} from "@xyflow/react";
import { Workflow, MoreHorizontal } from "lucide-react";
import type {
  AnyEventRecord,
  FlowPayload,
  Participant,
} from "@f-mark/shared";
import { copyToClipboard } from "../render/copy.js";
import { formatWhen, whoOf } from "./format.js";
import { FlowNode } from "./flow/FlowNode.js";
import { FlowEdge } from "./flow/FlowEdge.js";
import { layoutFlow } from "./flow/layoutFlow.js";
import "@xyflow/react/dist/style.css";

interface Props {
  event: AnyEventRecord;
  participants: Record<string, Participant>;
}

const NODE_TYPES = { flow: FlowNode };
const EDGE_TYPES = { flow: FlowEdge };

function FlowInner({ payload }: { payload: FlowPayload }): JSX.Element {
  const positioned = useMemo(
    () => layoutFlow(payload.nodes, payload.edges),
    [payload],
  );
  const rfNodes = useMemo<RfNode[]>(
    () =>
      positioned.map((n) => ({
        id: n.id,
        position: n.position!,
        data: { data: n },
        type: "flow",
      })),
    [positioned],
  );
  const rfEdges = useMemo<RfEdge[]>(
    () =>
      payload.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        type: "flow",
        data: { data: e },
        label: e.label,
      })),
    [payload],
  );
  const rf = useReactFlow();
  const focusedId = useMemo(
    () => payload.nodes.find((n) => n.focused === true)?.id,
    [payload],
  );

  return (
    <ReactFlow
      nodes={rfNodes}
      edges={rfEdges}
      nodeTypes={NODE_TYPES}
      edgeTypes={EDGE_TYPES}
      fitView
      onInit={() => {
        if (focusedId !== undefined) {
          const node = rf.getNode(focusedId);
          if (node !== undefined) {
            rf.fitView({ nodes: [node], padding: 0.3 });
          }
        }
      }}
      proOptions={{ hideAttribution: true }}
    >
      <Background gap={16} />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}

export function FlowCard({ event, participants }: Props): JSX.Element {
  const payload = event.payload as FlowPayload;
  const who = whoOf(event.participant_id, participants);
  const title =
    typeof payload.title === "string" && payload.title.length > 0
      ? payload.title
      : payload.id;

  return (
    <div className="flow-card" data-event-kind="flow">
      <div className="flow-head">
        <span
          className={["avatar", who.isUser ? "user" : "agent", "sm"].join(" ")}
          aria-hidden
        >
          {who.initial}
        </span>
        <span className="who">{who.name}</span>
        <span className="when">{formatWhen(event.timestamp)}</span>
        <span className="badge">
          <Workflow size={10} aria-hidden /> FLOW
        </span>
        <button
          type="button"
          className="menu"
          aria-label="Copy flow id"
          title="Copy flow id"
          onClick={() => void copyToClipboard(payload.id)}
        >
          <MoreHorizontal size={14} aria-hidden />
        </button>
      </div>
      <div className="flow-title">{title}</div>
      <div className="flow-canvas">
        <ReactFlowProvider>
          <FlowInner payload={payload} />
        </ReactFlowProvider>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run the test to confirm it passes**

```bash
pnpm --filter @f-mark/renderer test -- --run tests/cards/flow.test.tsx
```

Expected: 5 passes.

If React Flow throws about missing DOM APIs, revisit Step 1's shims and add whatever is reported. If CSS-import errors surface, confirm the vitest config inherits Vite's default CSS handling (no special config needed for the existing renderer setup).

- [ ] **Step 6: Commit**

```bash
git add packages/renderer/src/cards/FlowCard.tsx \
        packages/renderer/tests/cards/flow.test.tsx \
        packages/renderer/tests/setup.ts
git commit -m "feat(renderer/cards): FlowCard using @xyflow/react + jsdom shims"
```

### Task 10: Themed CSS for FlowCard

**Files:**
- Modify: `packages/renderer/src/cards/cards.css` (append at end)

- [ ] **Step 1: Append `.flow-card` rules + React Flow overrides**

Append to `packages/renderer/src/cards/cards.css`:

```css
/* === Flow card === */
:root {
  --flow-card-h: 360px;
}

.flow-card {
  border: 1px solid var(--line-2);
  border-radius: 10px;
  background: var(--canvas);
  overflow: hidden;
  box-shadow: var(--shadow);
}
.flow-head {
  padding: var(--card-head-pad-y) var(--card-head-pad-x);
  border-bottom: 1px solid var(--line-3);
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}
.flow-head .who {
  font-weight: 600;
  color: var(--ink);
}
.flow-head .when {
  color: var(--ink-4);
  font-family: var(--mono);
  font-size: 11px;
}
.flow-head .badge {
  margin-left: auto;
  font-family: var(--mono);
  font-size: 10.5px;
  color: var(--agent);
  background: var(--agent-tint);
  padding: 2px 8px;
  border-radius: 999px;
  display: flex;
  align-items: center;
  gap: 4px;
}
.flow-head .menu {
  color: var(--ink-4);
  width: 22px;
  height: 22px;
  border-radius: 5px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: 0;
  cursor: pointer;
}
.flow-head .menu:hover {
  background: var(--panel);
  color: var(--ink);
}
.flow-title {
  padding: var(--embed-title-pad-y) var(--card-foot-pad-x)
    calc(var(--embed-title-pad-y) - 8px);
  font-family: var(--serif);
  font-size: 17px;
  font-weight: 600;
  color: var(--ink);
  letter-spacing: -0.01em;
}
.flow-canvas {
  margin: var(--embed-frame-margin-y-top) var(--card-foot-pad-x)
    var(--embed-frame-margin-y-bot);
  border: 1px solid var(--line-2);
  border-radius: 6px;
  background: var(--canvas);
  overflow: hidden;
  height: var(--flow-card-h);
  position: relative;
}

/* === React Flow built-in overrides === */
.flow-canvas .react-flow,
.flow-canvas .react-flow__renderer {
  background: var(--canvas);
}
.flow-canvas .react-flow__background {
  color: var(--line-3);
}
.flow-canvas .react-flow__controls {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
}
.flow-canvas .react-flow__controls-button {
  background: var(--panel);
  border-bottom: 1px solid var(--line-2);
  color: var(--ink-2);
  fill: var(--ink-2);
}
.flow-canvas .react-flow__controls-button:hover {
  background: var(--panel-2);
}

/* === Custom flow node === */
.flow-node {
  font-family: var(--sans);
  background: var(--canvas);
  border: 1px solid var(--line-2);
  border-radius: var(--radius);
  padding: 8px 12px;
  min-width: 120px;
  color: var(--ink);
  font-size: 13px;
  position: relative;
  box-shadow: var(--shadow);
}
.flow-node[data-clickable="true"] {
  cursor: pointer;
}
.flow-node[data-clickable="true"]:hover {
  box-shadow: var(--shadow-2);
}
.flow-node .flow-node-label {
  font-weight: 600;
}
.flow-node .flow-node-title {
  font-size: 11px;
  color: var(--ink-3);
  margin-top: 2px;
}
.flow-node .flow-node-content {
  font-size: 12px;
  color: var(--ink-2);
  margin-top: 6px;
  line-height: 1.4;
}

.flow-node-info {
  border-color: var(--user);
  background: var(--user-tint);
}
.flow-node-info .flow-node-label {
  color: var(--user);
}
.flow-node-success {
  border-color: var(--green);
  background: var(--green-tint);
}
.flow-node-success .flow-node-label {
  color: var(--green);
}
.flow-node-danger {
  border-color: var(--rose);
  background: var(--user-tint);
}
.flow-node-danger .flow-node-label {
  color: var(--rose);
}
.flow-node-disabled {
  border-color: var(--ink-4);
  background: var(--panel-2);
  color: var(--ink-3);
  opacity: 0.6;
}
.flow-node.focused {
  box-shadow: 0 0 0 2px var(--agent), var(--shadow-2);
  outline: none;
}

.flow-handle {
  width: 7px !important;
  height: 7px !important;
  background: var(--ink-3) !important;
  border: 1px solid var(--canvas) !important;
}

/* === Custom flow edge === */
.flow-edge {
  stroke: var(--ink-3);
  stroke-width: 1.5;
  fill: none;
}
.flow-edge-info {
  stroke: var(--user);
}
.flow-edge-success {
  stroke: var(--green);
}
.flow-edge-danger {
  stroke: var(--rose);
}

@keyframes flow-dashflow {
  to {
    stroke-dashoffset: -20;
  }
}
.flow-edge.flowing {
  animation: flow-dashflow 0.7s linear infinite;
}

/* === Popover overlay === */
.flow-popover {
  position: absolute;
  top: 100%;
  left: 0;
  width: 280px;
  height: 220px;
  z-index: 10;
  margin-top: 4px;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--canvas);
  box-shadow: var(--shadow-2);
  overflow: hidden;
}
.flow-popover iframe {
  width: 100%;
  height: 100%;
  border: 0;
  display: block;
  background: var(--canvas);
}
```

- [ ] **Step 2: Manual visual check across themes**

Start the kernel + renderer (or use an existing instance) and POST a sample flow event (see Task 14 Step 2). Open the renderer, then cycle through the six themes (⌘K → "theme: <name>") and confirm:
- Default: nodes legible against canvas; focused glow obvious.
- Terminal: green/black palette; edges + nodes still readable.
- IDE-dark: monochrome readability holds.
- Solarized: cyan/orange palette adapts correctly.
- Brutalist: thick borders inherited (no rounded corners — `--border-w: 2px`, `--radius: 0`).
- Cyber: neon pink/cyan palette resolves cleanly.

Capture any contrast/legibility issues; if a theme breaks badly, add a theme-scoped override in this file (e.g. `body.theme-brutalist .flow-node { border-radius: 0; }`) — likely none needed since every color is a token.

- [ ] **Step 3: Commit**

```bash
git add packages/renderer/src/cards/cards.css
git commit -m "feat(renderer/cards): themed CSS for flow card + node/edge variants + popover"
```

---

## Phase 5 — Wire into dispatcher + aggregate

### Task 11: Wire FlowCard into `EventCard`

**Files:**
- Modify: `packages/renderer/src/cards/EventCard.tsx`

- [ ] **Step 1: Add the import**

In `packages/renderer/src/cards/EventCard.tsx`, add to the import block (after `EmbedCard`):

```typescript
import { FlowCard } from "./FlowCard.js";
```

- [ ] **Step 2: Add the dispatch branch**

After the `html` branch (around line 70), insert:

```typescript
if (event.kind === "flow") {
  return <FlowCard event={event} participants={participants} />;
}
```

- [ ] **Step 3: Update the routing-rules JSDoc**

In the top-of-file comment (lines 1-15), add to the list of routing rules:

```
     flow                           → FlowCard
```

- [ ] **Step 4: Run renderer tests**

```bash
pnpm --filter @f-mark/renderer test
```

Expected: full suite passes, including new flow tests.

- [ ] **Step 5: Commit**

```bash
git add packages/renderer/src/cards/EventCard.tsx
git commit -m "feat(renderer/cards): dispatch flow events to FlowCard"
```

### Task 12: Include flow events in the Document view

**Files:**
- Modify: `packages/renderer/src/state/aggregate.ts:43-49`

- [ ] **Step 1: Extend `feedDocument`**

In `packages/renderer/src/state/aggregate.ts:43-49`, replace the `feedDocument` filter:

```typescript
/* Document view: named prose + flow charts (durable deliberate contributions).
   Comments are dropped here — they appear as pins on the named cards.
   Turn-end dividers are dropped — they're conversational structure, not
   document content. */
const feedDocument = visible.filter(
  (e) =>
    (e.kind === "prose" && proseHasName(e) && !proseHasTarget(e)) ||
    e.kind === "flow",
);
```

- [ ] **Step 2: Add a regression test**

In `packages/renderer/tests/aggregate.test.ts` (the file from `git status` evidence; verify it exists with `ls packages/renderer/tests/aggregate.test.ts`), append:

```typescript
import { describe, it, expect } from "vitest";
import { aggregate } from "../src/state/aggregate";
import type { AnyEventRecord } from "@f-mark/shared";

describe("aggregate — flow events", () => {
  it("includes flow events in feedDocument", () => {
    const events: AnyEventRecord[] = [
      {
        filename: "20260523T100000Z_ag-claude.flow.json",
        timestamp: "20260523T100000Z",
        participant_id: "ag-claude",
        kind: "flow",
        payload: { id: "fl1", nodes: [], edges: [] },
      },
    ];
    const agg = aggregate(events);
    expect(agg.feedDocument).toHaveLength(1);
    expect(agg.feedDocument[0]!.kind).toBe("flow");
  });

  it("does NOT include flow events in feedConversation", () => {
    const events: AnyEventRecord[] = [
      {
        filename: "20260523T100000Z_ag-claude.flow.json",
        timestamp: "20260523T100000Z",
        participant_id: "ag-claude",
        kind: "flow",
        payload: { id: "fl1", nodes: [], edges: [] },
      },
    ];
    const agg = aggregate(events);
    expect(agg.feedConversation).toHaveLength(0);
  });
});
```

If `tests/aggregate.test.ts` already has its own top-level `describe`, just append the new ones; no need to restructure.

- [ ] **Step 3: Run the test**

```bash
pnpm --filter @f-mark/renderer test -- --run tests/aggregate.test.ts
```

Expected: green.

- [ ] **Step 4: Commit**

```bash
git add packages/renderer/src/state/aggregate.ts \
        packages/renderer/tests/aggregate.test.ts
git commit -m "feat(renderer/state): include flow events in Document view"
```

### Task 13: Confirm projectFeed treats flow as a standalone item

**Files:**
- Read-only audit: `packages/renderer/src/feed/projectFeed.ts`
- Modify or create: `packages/renderer/src/feed/projectFeed.test.ts`

- [ ] **Step 1: Audit `projectFeed.ts`**

Open `packages/renderer/src/feed/projectFeed.ts`. Confirm:
- `isMidTurn(ev)` returns `true` ONLY for `tool-use` or prose with `arbitrary: true`.
- A `flow` event therefore returns `false` from `isMidTurn` → it is emitted as a standalone `{type:"event"}` feed item, not absorbed into an `ArbitraryGroupCard`.

No code change required. Note the observation in the next commit message.

- [ ] **Step 2: Add a regression test**

Append to `packages/renderer/src/feed/projectFeed.test.ts` (the existing file):

```typescript
describe("projectFeed — flow events", () => {
  it("flow events surface as standalone feed items, not inside arbitrary groups", () => {
    const events: AnyEventRecord[] = [
      {
        filename: "20260523T100000Z_ag-claude.tool-use.json",
        timestamp: "20260523T100000Z",
        participant_id: "ag-claude",
        kind: "tool-use",
        payload: {
          tool_name: "Bash",
          tool_use_id: "tu1",
          input: {},
          success: true,
        },
      },
      {
        filename: "20260523T100001Z_ag-claude.flow.json",
        timestamp: "20260523T100001Z",
        participant_id: "ag-claude",
        kind: "flow",
        payload: { id: "fl1", nodes: [], edges: [] },
      },
    ];
    const items = projectFeed(events);
    const flowItem = items.find(
      (i) => i.type === "event" && i.event.kind === "flow",
    );
    expect(flowItem).toBeDefined();
  });
});
```

If the file's existing imports don't yet pull `AnyEventRecord`, add it.

- [ ] **Step 3: Run the test**

```bash
pnpm --filter @f-mark/renderer test -- --run src/feed/projectFeed.test.ts
```

Expected: green.

- [ ] **Step 4: Commit**

```bash
git add packages/renderer/src/feed/projectFeed.test.ts
git commit -m "test(renderer/feed): flow events surface as standalone items (not mid-turn grouped)"
```

---

## Phase 6 — Agent documentation

### Task 14: Document flow event in AGENT.md + per-runtime skill bundles

**Files:**
- Modify: `packages/kernel/assets/AGENT.md` (insert in Event kinds section)
- Modify: `packages/kernel/assets/claude-skill/f-mark/api.md`
- Modify: `packages/kernel/assets/claude-skill/f-mark/SKILL.md`
- Modify: `packages/kernel/assets/codex-skill/f-mark/api.md`
- Modify: `packages/kernel/assets/codex-skill/f-mark/SKILL.md`
- Modify: `packages/kernel/assets/gemini-skill/f-mark/api.md`
- Modify: `packages/kernel/assets/gemini-skill/f-mark/SKILL.md`

- [ ] **Step 1: Insert the Flow section in `AGENT.md`**

In `packages/kernel/assets/AGENT.md`, between the `events/choice` entry and `events/turn-end` entry (around line 47, after the `choice` event description ending with "you may post on your own behalf if needed."), insert:

````markdown
- `POST /sessions/:id/events/flow` — body `{ participant_id, id, title?, nodes, edges, supersedes? }`. Use whenever you want to show the user a **diagram, flowchart, dependency graph, decision tree, or pipeline**. Prefer this over ASCII art or markdown lists for any non-trivial graph.

  - `id` — your own stable string (e.g. `fl_arch`). Re-use it with `supersedes` to revise.
  - `nodes` — array. Each: `{ id, label, title?, content?, popover?, itemType?, focused?, position? }`.
    - `itemType` ∈ `default | info | success | danger | disabled` — drives the node's color and weight.
    - `focused: true` — at most one. The renderer centers the viewport on it and adds a highlight ring.
    - `popover` — `{ html, css?, js? }`. Rendered inside a sandboxed iframe on click. Use for rich detail (tables, mini-charts, links).
    - `position` — `{ x, y }` in pixels. **Omit it if you want auto-layout.** If ANY node lacks a position, the whole graph is auto-laid-out (left-to-right). "All or nothing" — don't mix.
  - `edges` — array. Each: `{ id, source, target, label?, style?, type? }`.
    - `style` ∈ `solid | dashed | dotted | flowing`. `flowing` = animated marching dashes.
    - `type` ∈ `default | info | success | danger`. Drives the stroke color.

  Example:

  ```json
  {
    "participant_id": "ag-claude",
    "id": "fl_release",
    "title": "Release pipeline",
    "nodes": [
      { "id": "p1", "label": "Build",  "itemType": "default" },
      { "id": "p2", "label": "Test",   "itemType": "info"    },
      { "id": "p3", "label": "Deploy", "itemType": "success", "focused": true,
        "popover": { "html": "<p>Deploys to <b>prod</b> via GitHub Actions.</p>" } }
    ],
    "edges": [
      { "id": "e1", "source": "p1", "target": "p2", "style": "solid" },
      { "id": "e2", "source": "p2", "target": "p3", "style": "flowing", "type": "success" }
    ]
  }
  ```
````

- [ ] **Step 2: Add the flow endpoint to `claude-skill/f-mark/api.md`**

In `packages/kernel/assets/claude-skill/f-mark/api.md`, after the `events/turn-end` block (around line 82, before `## Reading events`), append:

````markdown
`POST /sessions/<id>/events/flow`

```json
{
  "participant_id": "ag-claude",
  "id": "fl_arch",
  "title": "System architecture",
  "nodes": [
    { "id": "n1", "label": "Client", "itemType": "info" },
    { "id": "n2", "label": "Gateway", "itemType": "default" },
    { "id": "n3", "label": "Worker", "itemType": "success", "focused": true,
      "popover": { "html": "<p>Auto-scaled on CPU.</p>" } }
  ],
  "edges": [
    { "id": "e1", "source": "n1", "target": "n2", "style": "solid" },
    { "id": "e2", "source": "n2", "target": "n3", "style": "flowing", "type": "success" }
  ]
}
```

Use for diagrams, flowcharts, dependency graphs, decision trees, pipelines. The renderer auto-lays-out the graph when `position` is omitted on any node. `popover.html` is rendered inside a sandboxed iframe; `css` and `js` are optional companions.
````

- [ ] **Step 3: Add the same block to `codex-skill/f-mark/api.md` and `gemini-skill/f-mark/api.md`**

Copy the same content verbatim into both files in the equivalent location.

- [ ] **Step 4: Add a one-paragraph note to each `SKILL.md`**

In each of the three SKILL.md files (`claude-skill/f-mark/SKILL.md`, `codex-skill/f-mark/SKILL.md`, `gemini-skill/f-mark/SKILL.md`), find the section that lists structured contributions (search for "POST /sessions" or "Structured contributions" or "Event kinds"). Add a paragraph:

```markdown
**Flow charts / diagrams.** When the user asks for a diagram, flowchart, pipeline, or decision tree — or whenever you'd otherwise reach for ASCII art — POST `/sessions/<id>/events/flow` with `{ id, nodes, edges }`. See `api.md` for the full schema. Nodes support `itemType` (info/success/danger/disabled), `focused: true` for emphasis, and `popover: { html, css?, js? }` for click-to-reveal detail. Edges support `style: flowing` for animated dashes.
```

If a SKILL.md has no obvious anchor, drop the paragraph just above the "Bootstrap" or "Loop" section.

- [ ] **Step 5: Commit**

```bash
git add packages/kernel/assets/AGENT.md \
        packages/kernel/assets/claude-skill/f-mark/api.md \
        packages/kernel/assets/claude-skill/f-mark/SKILL.md \
        packages/kernel/assets/codex-skill/f-mark/api.md \
        packages/kernel/assets/codex-skill/f-mark/SKILL.md \
        packages/kernel/assets/gemini-skill/f-mark/api.md \
        packages/kernel/assets/gemini-skill/f-mark/SKILL.md
git commit -m "docs(agent): document flow event kind in AGENT.md + per-runtime skill bundles"
```

---

## Phase 7 — End-to-end smoke + housekeeping

### Task 15: Smoke the round-trip

- [ ] **Step 1: Start kernel + renderer**

```bash
pnpm --filter f-mark dev
# in another shell:
pnpm --filter @f-mark/renderer dev
```

(Or use existing running instances if you have them.)

- [ ] **Step 2: POST a flow event via curl**

Set `T=$(cat .f-mark/.token)`, `S=<your-session-id>`, `P=<your-agent-pid>` from the running project. Then:

```bash
curl -s -X POST "http://localhost:7777/sessions/$S/events/flow" \
  -H "Authorization: Bearer $T" \
  -H "Content-Type: application/json" \
  -d '{
    "participant_id": "'"$P"'",
    "id": "fl_smoke",
    "title": "Smoke test",
    "nodes": [
      { "id": "a", "label": "Start", "itemType": "info" },
      { "id": "b", "label": "Middle", "itemType": "default",
        "popover": { "html": "<p>I am a popover</p>", "css": "p{color:#268}" } },
      { "id": "c", "label": "End", "itemType": "success", "focused": true }
    ],
    "edges": [
      { "id": "e1", "source": "a", "target": "b", "style": "dashed" },
      { "id": "e2", "source": "b", "target": "c", "style": "flowing", "type": "success" }
    ]
  }'
```

Expected: HTTP 200, response body `{ filename: ".../*.flow.json", kind: "flow", ... }`.

- [ ] **Step 3: Visually verify the card**

Open the renderer in a browser. Confirm in order:

1. A card with the FLOW badge appears at the bottom of the feed.
2. Title "Smoke test" reads correctly under the head.
3. Three nodes are drawn; Start is info-blue, Middle is default, End is success-green.
4. The End node has the focused ring and the viewport is zoomed onto it on first render.
5. The `a→b` edge is statically dashed; the `b→c` edge has marching dashes (animated).
6. Clicking the Middle node opens a popover with a sandboxed iframe containing the `<p>` element in blue.

If any of these fail, capture the bug, fix it in the appropriate task above, and re-smoke.

- [ ] **Step 4: Verify supersession**

Re-POST with `supersedes` set to the filename from Step 2:

```bash
curl -s -X POST "http://localhost:7777/sessions/$S/events/flow" \
  -H "Authorization: Bearer $T" \
  -H "Content-Type: application/json" \
  -d '{
    "participant_id": "'"$P"'",
    "id": "fl_smoke",
    "supersedes": "<filename-from-step-2>",
    "nodes": [{ "id": "a", "label": "Revised", "itemType": "default" }],
    "edges": []
  }'
```

Confirm the renderer hides the original card and shows the single-node revision.

- [ ] **Step 5: Verify across themes**

Cycle the six themes via the command palette (⌘K → "theme: <name>") and confirm the FlowCard adapts cleanly in each. Capture screenshots if any theme regresses.

- [ ] **Step 6: Run the full test suite**

```bash
pnpm --filter f-mark test
pnpm --filter @f-mark/renderer test
```

Expected: all green. Record the new test counts (kernel + renderer) for the commit message of Task 16.

### Task 16: Self-review pass

- [ ] **Step 1: Walk the spec against the task list**

The user asked for:

1. A dedicated endpoint with a simple `{ nodes, edges }` syntax → **Task 2** (endpoint), **Task 1** (schema).
2. Nodes can carry `label / title / content / popover (innerHtml + css + js) / itemType (info/danger/default/disabled/success) / focused` → **Task 1** (schema), **Task 7** (rendering), **Task 6** (popover assembler).
3. Edges can carry `style: solid/dashed/dotted/flowing dash`, `type: danger/success` → **Task 1** (schema), **Task 8** (rendering), **Task 10** (`flowing` animation).
4. Render with react-flow → **Task 9** (FlowCard).
5. A rendering tile in the chat → **Task 9** + **Task 11** (EventCard dispatch).
6. Theme adaptation → **Task 10** (CSS overrides on existing tokens).

If any miss surfaces, add a task and execute it before finishing.

- [ ] **Step 2: Verify working tree is clean**

```bash
git status
```

Expected: clean. If anything has drifted (lockfile, build artifact, stray test fixture), commit it with a `chore:` message.

---

## Notes for future iterations

Not in scope but recorded so they don't surprise the next plan:

- **Server-side layout**: kernel currently sends payload as-is; renderer runs dagre. If we ever want stable positions across re-renders or headless export, move the dagre call to the kernel write path.
- **Mixed-mode layout**: today, ANY missing position triggers a full dagre relayout (so partial positions are discarded). A nicer rule would be "respect the explicit ones and only place the rest" — but dagre doesn't support pinned nodes natively. Worth a follow-up task if real usage hits it.
- **Edge labels**: passed through as React Flow's built-in label render; not themed. A custom label component would make it match the rest of the card.
- **Popover positioning**: anchors top-left under the node. For nodes near the right/bottom edge it overflows. Add a flip-to-other-side heuristic once real usage hits it.
- **Density-aware `--flow-card-h`**: a single `:root` default. If compact/spacious users complain, add per-density overrides in `themes/density.css`.
- **Compose-side affordance**: there's no UI to *create* a flow from the human side. A `+ Flow chart` button in the compose bar would be a nice next-feature.
