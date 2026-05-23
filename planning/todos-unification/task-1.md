# Todos Unification — Chunk 1: Data model + cascade + agent serialization

## Goal

Extend the todos data model so subtasks are representable, removal cascades
through children, and the `GET /sessions/:id/todos` response gives the agent
a properly structured (tree-shaped, status-aware, description-bearing) view
of the todo list.

This chunk lays the groundwork for Chunk 2 (unified UI), Chunk 3 (keyboard
behavior), and Chunk 4 (compose "Create Todo" button). **No renderer UI
changes in this chunk.** All renderer work waits for Chunk 2 once the schema
is stable.

## Context

### Current shape — read these before editing
- `packages/shared/src/events.ts:55-62` defines `TodoPayload`:
  ```ts
  interface TodoPayload {
    id: string;
    title: string;
    body?: string;
    status: "open" | "done" | "wip";
    assigned_to?: string;
    supersedes?: string;
  }
  ```
- `packages/kernel/src/routes/todos.ts` is the only kernel surface for
  todos:
  - `POST /sessions/:id/events/todo` writes a new todo event (insert or
    state change). Schema is hand-written Fastify JSON schema with `body`,
    `status`, `assigned_to`, `supersedes` as the optional fields.
  - `GET /sessions/:id/todos[?assigned_to=…]` reads back todos, applies
    "latest version per `id` by timestamp", drops anything referenced by
    a later event's `supersedes`, and returns flat buckets:
    `{ open: TodoPayload[], wip: TodoPayload[], done: TodoPayload[] }`.
- `packages/renderer/src/api/client.ts:38,108-111,223-249` exposes
  `postTodo`, `listTodos`, and the `TodoBuckets` type the renderer relies
  on. Treat the existing buckets shape as **load-bearing for current
  renderer code** — Chunk 1 must not break the current renderer.
- Tests:
  - `packages/kernel/tests/routes/todos.test.ts` — kernel-side coverage.
  - `packages/renderer/tests/cards/todo.test.tsx`,
    `packages/renderer/tests/panels/todos.test.tsx` — renderer coverage
    that asserts the current shape.

### Event-sourcing primer (so you don't accidentally mutate state)
A todo's lifetime is a chain of `todo` events that share `id`. Each new
event has `supersedes` pointing at the previous event's filename. The
reader picks the latest by timestamp and drops anything that's been
superseded. There is **no delete** today; updates rewrite.

For "removed" we therefore have two choices:
1. Add a fourth status `"removed"` and filter it out in the buckets reader.
2. Add a `removed: true` boolean alongside `status`.

**Pick option 1.** It's the smaller schema change, plays nicely with the
existing supersession chain (a new event with `status: "removed"`
supersedes the previous), and matches how we already think about lifecycle
in this code. Document the choice in `progress-log.md`.

## Deliverables

### 1. Schema extension — `packages/shared/src/events.ts`
Add to `TodoPayload`:
```ts
parent_id?: string;
```
Add to the `status` union: `"removed"`. Final shape:
```ts
interface TodoPayload {
  id: string;
  title: string;
  body?: string;
  status: "open" | "done" | "wip" | "removed";
  assigned_to?: string;
  parent_id?: string;
  supersedes?: string;
}
```

That's the only change in `events.ts`. Do not refactor any other type.

### 2. Kernel POST — `packages/kernel/src/routes/todos.ts`
- Extend the Fastify JSON schema for `POST /sessions/:id/events/todo` to
  accept the new optional `parent_id: string` and to allow `"removed"` in
  the `status` enum.
- Mirror the destructuring/payload assembly so `parent_id` round-trips
  into the event payload. Keep the same shape and ordering of optionals.

### 3. Kernel cascade-remove
- New endpoint or behavior: when a client posts
  `{ id, status: "removed", supersedes: <latest-filename> }`, the kernel
  should also auto-emit `"removed"` events for every descendant todo
  (transitive children via `parent_id`) so the renderer's next `GET`
  reflects the cascade.
- Implement this **inside the POST handler**: if `status === "removed"`,
  resolve the current tree (run the same latest-version-by-id logic the
  GET handler uses, restricted to non-removed todos), find every
  transitive descendant via `parent_id`, and emit a `"removed"` event
  for each (one per descendant) with `supersedes` pointing at that
  descendant's current latest filename. Publish a bus event per emitted
  file.
- Subtle: avoid infinite loops. The descendant traversal is over the
  pre-cascade snapshot — don't re-read mid-write.
- Subtle: the actor (`participant_id`) for the cascaded events should be
  the same as the actor on the originating remove request.

### 4. Kernel GET — buckets + tree
The existing `{ open, wip, done }` buckets stay (renderer compatibility).
**Add a `tree` field** to the same response so the agent sees the full
hierarchical view in one call:

```ts
interface TodoTreeNode {
  id: string;
  title: string;
  body?: string;
  status: "open" | "done" | "wip";   // "removed" never appears
  assigned_to?: string;
  parent_id?: string;
  children: TodoTreeNode[];
}

// Response shape:
{
  open: TodoPayload[];
  wip: TodoPayload[];
  done: TodoPayload[];
  tree: TodoTreeNode[];   // roots (parent_id absent) with nested children
}
```

Rules for `tree`:
- Exclude todos whose latest status is `"removed"`.
- A child whose `parent_id` points at a removed/missing todo gets promoted
  to a root (don't drop orphans).
- Order: roots in **creation order** (earliest timestamp first — the
  buckets stay newest-first for the renderer; tree is forward-order so the
  agent reads them as written). Children inside a node follow the same
  rule. **This is intentional — note it in `progress-log.md`.**
- The agent uses `tree`; renderer keeps using buckets for now. Chunk 2
  will switch the renderer to consume `tree` for indentation.

### 5. Update the renderer client — `packages/renderer/src/api/client.ts`
- Extend `TodoBuckets` (or introduce `TodoListResponse`) to include the
  new `tree` field. Keep the existing usage call sites working — if you
  rename, add an alias. Simplest: add `tree: TodoTreeNode[]` to the
  existing return shape and re-export the new `TodoTreeNode` type from
  `@f-mark/shared`.
- Add `parent_id?: string` to the `PostTodoBody` type so the renderer can
  send it in Chunk 4.

### 6. Shared exports
Re-export `TodoTreeNode` from `packages/shared/src/index.ts` (wherever
the other event types are re-exported — match the file's pattern).

### 7. Tests
- **Kernel** (`packages/kernel/tests/routes/todos.test.ts`):
  - POST accepts `parent_id`; round-trips into the event file.
  - POST accepts `status: "removed"`.
  - Posting a `"removed"` status for a parent cascades: subsequent GET
    no longer shows the parent OR any of its transitive descendants in
    any bucket OR in `tree`.
  - GET returns the new `tree` field with correct nesting, correct
    creation-order, and orphan-promotion behavior. Cover at least:
    parent + 2 children + 1 grandchild; sibling at root; a removed
    parent that orphans a surviving child.
- **Renderer** (`packages/renderer/tests/cards/todo.test.tsx` and
  `tests/panels/todos.test.tsx`): no behavior change in Chunk 1. The
  existing assertions on buckets must still pass. If you need to update
  a test because the client shape gained a `tree` field, do it minimally
  (e.g. mocks may need to add `tree: []`).

## Constraints

- **No renderer UI changes.** Don't touch `TodoCard.tsx`, `Todos.tsx`,
  `RightTodos.tsx`, or any compose / panel components. Their structure is
  redesigned in Chunk 2.
- **No deletion of files on disk.** "Removed" is event-sourced like
  everything else. The kernel writes a new `"removed"` event; existing
  files stay.
- **Don't change the `id` allocation scheme** (`td-xxxx`). The renderer
  still owns id generation.
- **Don't break `assigned_to` filtering.** The `?assigned_to=...` query
  must keep working: removed todos and their descendants should not
  appear regardless of who they were assigned to.
- **Don't introduce new dependencies.**
- **Don't touch the in-flight density CSS or shortcut-related files**
  unless absolutely required (it shouldn't be).
- **Don't touch other in-flight dirty work** (`PresetEditorModal.tsx`,
  `customPresets.ts`, `settings.ts`, etc.).
- Keep diffs surgical. If you find a `// TODO` related to subtasks, leave
  it — Chunk 2 owns UI surface.

## Definition of done

1. `pnpm -F @f-mark/shared build` passes.
2. `pnpm -F f-mark test` passes (kernel suite, including new cascade /
   tree assertions).
3. `pnpm -F f-mark build` passes.
4. `pnpm -F @f-mark/renderer test` passes (existing renderer tests
   continue to work; renderer code is unchanged behaviorally).
5. `pnpm -F @f-mark/renderer build` passes.
6. `grep -n "parent_id" packages/shared/src/events.ts` shows the new
   optional field.
7. `grep -n "removed" packages/shared/src/events.ts` shows the new status
   enum value.
8. `grep -n "TodoTreeNode" packages/shared/src/` and
   `packages/kernel/src/routes/todos.ts` and
   `packages/renderer/src/api/client.ts` all show the new type in use.
9. `planning/todos-unification/progress-log.md` exists with the four
   standard sections + a short summary at the end.

## Notes

- Bump the renderer in a separate commit/diff hunk from the kernel/shared
  if practical — makes review easier — but a single coherent commit is
  fine too.
- The agent serialization is the WHY for `tree`. Keep node `body`
  included so the agent reads the description. Don't strip whitespace.
