# Todos Unification Audit

## Bugs confirmed

### Renderer accepts a bucket-only todo response as an empty tree (P0 broken)

- **Where:** `packages/renderer/src/panels/TodoTreeList.tsx:52-58`, `packages/renderer/src/panels/TodoTreeList.tsx:131-132`, `packages/renderer/src/panels/TodoTreeList.tsx:572-598`.
- **Trigger:** `client.listTodos()` resolves to an object with populated `open`/`wip`/`done` buckets but `tree` missing or not usable. That response shape is the source-confirmed trigger; the source does not prove which runtime layer produced it.
- **What should happen:** The renderer should reject the malformed response, surface a load-contract error, or degrade by deriving a flat tree from the buckets. It should not say the session is empty.
- **What happens:** `responseOrEmpty()` copies bucket arrays but silently substitutes `tree: []`. The same `setTodos(next)` then makes the right panel count `Open N` from `todos.open.length` while rendering "Preparing first task..." because `todos.tree.length === 0 && draft === null`.
- **Why this answers the primary question:** There is no stale closure in the render path: counts are computed from `todos.open/wip/done` at `TodoTreeList.tsx:572-576`, and the empty message is computed from `todos.tree` at `TodoTreeList.tsx:596-598` in the same render. The only source path that strips the tree while preserving counts is `responseOrEmpty()`.
- **What I could not confirm from source alone:** I cannot prove which runtime layer made the browser receive a response without `tree`, because the verified kernel route returns `tree`. Confirm by capturing the browser Network response for `GET /sessions/2026-05-22-seesion-try-1/todos` or by temporarily logging the raw `await client.listTodos(...)` value before `responseOrEmpty()`.
- **Proposed minimal fix:**

```ts
function normalizeTodos(raw: unknown): TodoListResponse {
  const value = raw as Partial<TodoListResponse> | null | undefined;
  const open = Array.isArray(value?.open) ? value.open : [];
  const wip = Array.isArray(value?.wip) ? value.wip : [];
  const done = Array.isArray(value?.done) ? value.done : [];
  if (!Array.isArray(value?.tree)) {
    if (open.length + wip.length + done.length > 0) {
      return {
        open,
        wip,
        done,
        tree: [...open, ...wip, ...done].map((t) => ({ ...t, children: [] })),
      };
    }
    throw new Error("Todo response missing required tree field");
  }
  return { open, wip, done, tree: value.tree };
}
```

Also add a regression test where `/todos` returns `{ open: [todo], wip: [], done: [] }` and assert the item is visible or an explicit contract error is shown, never "Preparing first task...".

### Auto-first-task is keyed only on `tree.length`, not on actual todo count (P1 wrong)

- **Where:** `packages/renderer/src/panels/TodoTreeList.tsx:263-279`.
- **Trigger:** Same malformed state as above: bucket count is nonzero but `tree` is empty.
- **What should happen:** Auto-create should run only when the todo response is valid and there are zero todos by both tree and buckets.
- **What happens:** The effect checks only `todos.tree.length > 0 || draft !== null` at `TodoTreeList.tsx:267`. If `tree` is missing/fallback-empty, it reserves the session and posts a new blank "first" task even though `open` already contains tasks.
- **Proposed minimal fix:**

```ts
const bucketCount = todos.open.length + todos.wip.length + todos.done.length;
if (todos.tree.length > 0 || bucketCount > 0 || draft !== null) return;
```

Tie this to response validation so a bucket/tree mismatch is treated as degraded data, not as an empty session.

### The "Preparing first task..." message renders before a valid loaded-empty state (P2 sloppy)

- **Where:** `packages/renderer/src/panels/TodoTreeList.tsx:95-99`, `packages/renderer/src/panels/TodoTreeList.tsx:596-598`.
- **Trigger:** Initial mount before `loadTodos()` has resolved, or any transient reset to `EMPTY_TODOS`.
- **What should happen:** Loading, loaded-empty, and auto-create-in-flight should be distinct states.
- **What happens:** Initial state is `EMPTY_TODOS`; before `loadedSessionId` is checked, the UI can render "Preparing first task...". On the reported malformed response, it persists next to nonzero counts.
- **Proposed minimal fix:** Gate the message on `loadedSessionId === currentSessionId`, `loadError === null`, and `bucketCount === 0`, or remove the message and render only the focused auto-created row once it exists.

### In-flight todo loads can overwrite newer state because cancellation is a no-op (P1 wrong)

- **Where:** `packages/renderer/src/panels/TodoTreeList.tsx:123-151`.
- **Trigger:** Session switch, rapid event bursts, or a slow `/todos` response racing with a newer `loadTodos()`.
- **What should happen:** Stale requests should not call `setTodos()`.
- **What happens:** The effect sets `cancelled`, but `loadTodos()` performs `setTodos()` internally before the effect checks `cancelled` at `TodoTreeList.tsx:145-147`. A stale response can replace a fresher tree.
- **Proposed minimal fix:** Move state-setting into the effect after the cancellation check, or use a monotonically increasing request id:

```ts
const requestId = ++loadRequestRef.current;
const next = await client.listTodos(sessionId);
if (requestId !== loadRequestRef.current) return;
setTodos(normalizeTodos(next));
```

### Failed reloads clear previously visible todos (P2 sloppy)

- **Where:** `packages/renderer/src/panels/TodoTreeList.tsx:135-138`.
- **Trigger:** A benign transient `/todos` error after a successful load.
- **What should happen:** Keep the last good todos and show a load error.
- **What happens:** The catch block calls `setTodos(EMPTY_TODOS)`, hiding all tasks. This is not the exact reported count/tree contradiction because counts also become zero, but it is a nearby bad failure mode.
- **Proposed minimal fix:** Do not clear `todos` on reload failure once `loadedSessionId` is current; preserve last good state and set `loadError`.

### Compose parent dropdown assumes `todos.tree` exists (P2 sloppy)

- **Where:** `packages/renderer/src/compose/CreateTodoPopover.tsx:86-107`, `packages/renderer/src/compose/CreateTodoPopover.tsx:94-95`, `packages/renderer/src/panels/todoPanelUtils.ts:127-141`.
- **Trigger:** Same bucket-only `/todos` response.
- **What should happen:** The compose form should use the same validated/normalized todo response as the panels.
- **What happens:** `setRoots(todos.tree)` can receive `undefined`, and then `flattenTreeForDropdown(roots)` expects an array. This can break parent selection or crash the popover.
- **Proposed minimal fix:** Share the `normalizeTodos()` helper with `TodoTreeList` and use `setRoots(normalized.tree)`.

## Spec compliance review

- ✅ **Unify inline, left panel, and right panel:** Inline `TodoCard` delegates to `TodoItem` at `packages/renderer/src/cards/TodoCard.tsx:127-139`; left and right panels both render `TodoTreeList` at `packages/renderer/src/panels/Todos.tsx:23` and `packages/renderer/src/panels/right/RightTodos.tsx:5-9`.
- ✅ **Make boxes tickable:** `TodoItem` renders the checkbox at `packages/renderer/src/cards/TodoItem.tsx:284-291`; panel toggle posts open/done at `packages/renderer/src/panels/TodoTreeList.tsx:531-533`; inline toggle posts at `packages/renderer/src/cards/TodoCard.tsx:133-135`.
- ✅ **Remove button and assignee badge/dropdown:** Remove button is at `packages/renderer/src/cards/TodoItem.tsx:401-408`; assignee badge and menu are at `packages/renderer/src/cards/TodoItem.tsx:316-386`.
- ✅ **Task title/description placeholders, first task placeholder:** Title and description placeholders are at `packages/renderer/src/cards/TodoItem.tsx:294-309`; first-task placeholder is selected at `packages/renderer/src/panels/TodoTreeList.tsx:515-526`.
- ⚠️ **Create first task automatically when empty:** Implemented at `packages/renderer/src/panels/TodoTreeList.tsx:263-279`, but it incorrectly trusts `tree.length` alone and can fire when buckets prove the session is not empty.
- ✅ **Add button as last opened item, no top-right add:** Bottom row is at `packages/renderer/src/panels/TodoTreeList.tsx:599-609`; left panel header has no add button at `packages/renderer/src/panels/Todos.tsx:17-23`.
- ✅ **Default assignee to a random agent:** Helper is `pickRandomAgentId()` at `packages/renderer/src/panels/todoPanelUtils.ts:31-35`; used for panel creates at `packages/renderer/src/panels/TodoTreeList.tsx:217`, `:355`, `:363`, and compose default at `packages/renderer/src/compose/CreateTodoPopover.tsx:59-62`.
- ✅ **Allow description below title:** Description textarea is rendered under the title at `packages/renderer/src/cards/TodoItem.tsx:304-314`.
- ✅ **Introduce subtasks with parent task and render accordingly:** Kernel schema accepts `parent_id` at `packages/kernel/src/routes/todos.ts:347-349`; tree rendering recurses children at `packages/renderer/src/panels/TodoTreeList.tsx:547-552`; indentation data is applied at `packages/renderer/src/cards/TodoItem.tsx:259-280`.
- ✅ **Add subtask param creates indented subtask:** Panel child drafts set `parentId` at `packages/renderer/src/panels/TodoTreeList.tsx:359-364` and POST it at `packages/renderer/src/panels/TodoTreeList.tsx:336`; inline card POSTs `parent_id` at `packages/renderer/src/cards/TodoCard.tsx:89-100`.
- ✅ **Removing a todo removes its children:** UI posts a single parent removal at `packages/renderer/src/panels/TodoTreeList.tsx:421-437`; kernel cascades descendants at `packages/kernel/src/routes/todos.ts:359-394`. See cascade notes below for edge cases.
- ✅ **Tab indents:** Key handler calls indent at `packages/renderer/src/cards/TodoItem.tsx:210-215`; parent selection helper is `packages/renderer/src/panels/todoPanelUtils.ts:143-154`; panel posts reparent at `packages/renderer/src/panels/TodoTreeList.tsx:384-392`.
- ✅ **Shift+Tab un-indents:** Same key handler, outdent helper at `packages/renderer/src/panels/todoPanelUtils.ts:156-164`, and panel wiring at `packages/renderer/src/panels/TodoTreeList.tsx:394-407`.
- ✅ **Enter on title moves to description:** `packages/renderer/src/cards/TodoItem.tsx:231-234`.
- ✅ **Enter on description saves and creates below:** `packages/renderer/src/cards/TodoItem.tsx:237-242`; panel commit/create paths at `packages/renderer/src/panels/TodoTreeList.tsx:440-465`.
- ✅ **Cmd/Ctrl+Backspace removes item and children:** Key handler at `packages/renderer/src/cards/TodoItem.tsx:224-228`; panel removal at `packages/renderer/src/panels/TodoTreeList.tsx:421-437`; kernel cascade at `packages/kernel/src/routes/todos.ts:379-394`.
- ✅ **Up/down focus previous/next same-level, then visible fallback:** Flattening computes same-depth and adjacent ids at `packages/renderer/src/panels/todoPanelUtils.ts:111-121`; focus uses same-depth fallback at `packages/renderer/src/panels/TodoTreeList.tsx:409-419`.
- ✅ **Cmd/Ctrl+Enter crosses/uncrosses:** Key handler at `packages/renderer/src/cards/TodoItem.tsx:218-220`; status toggle at `packages/renderer/src/panels/TodoTreeList.tsx:531-533`.
- ✅ **Agent receives aligned todo list with statuses, subtasks, descriptions:** Kernel tree nodes include title/body/status/assignee/parent at `packages/kernel/src/routes/todos.ts:97-107`; creation-order tree sorting is at `packages/kernel/src/routes/todos.ts:164-174`; response includes buckets plus tree at `packages/kernel/src/routes/todos.ts:195-198`.
- ✅ **Compose Create Todo button with title, description, parent dropdown, assignee, end-turn chaining:** Button is at `packages/renderer/src/compose/Compose.tsx:336-346`; popover fields are at `packages/renderer/src/compose/CreateTodoPopover.tsx:180-251`; submit body is built at `packages/renderer/src/compose/CreateTodoPopover.tsx:121-136`; end-turn chaining is at `packages/renderer/src/compose/Compose.tsx:171-177`.

## Code-health observations

- **P1 test gap:** Panel tests always mock a valid `tree` field via `responseFor()` at `packages/renderer/tests/panels/todos.test.tsx:28-35` and `installTodoFetch()` at `packages/renderer/tests/panels/todos.test.tsx:50-72`. There is no regression test for a bucket-only response, which is the reported failure shape.
- **P1 shared normalization missing:** `createClient().listTodos()` casts unknown JSON to `TodoListResponse` at `packages/renderer/src/api/client.ts:247-255`; both panels and compose then trust or weakly normalize it separately. Runtime response validation should live next to the API client or in one shared todo response helper.
- **P2 inline supersession chain is weak:** `TodoCard` always posts `supersedes: event.filename` at `packages/renderer/src/cards/TodoCard.tsx:51-63`. Multiple inline edits before the feed refresh all supersede the same original file; tests currently assert that behavior at `packages/renderer/tests/cards/todo.test.tsx:177-190`. Latest-by-timestamp hides it, but it violates the intended linear supersession chain.
- **P2 parent remove accepts missing/stale supersedes:** The POST schema leaves `supersedes` optional at `packages/kernel/src/routes/todos.ts:347-349`. GET still hides a latest `"removed"` event by timestamp, but the event-sourcing contract says removals should supersede the latest filename. Consider validating for `status: "removed"` or at least logging stale/missing supersedes.
- **P3 unused prop:** `TodoItem` accepts `agentIds` but renames it to `_agentIds` and never uses it at `packages/renderer/src/cards/TodoItem.tsx:77-82`. Default-assignee selection lives in parents, so the prop can be removed unless future UI needs it.

## Cascade-remove sanity check

- **Does the kernel emit one `"removed"` event per descendant?** Yes for visible descendants in the pre-cascade snapshot. The POST handler detects a parent removal at `packages/kernel/src/routes/todos.ts:359-368`, writes the parent removed event at `packages/kernel/src/routes/todos.ts:371-377`, then loops `cascadedRemovals` and writes one removed event per descendant at `packages/kernel/src/routes/todos.ts:379-394`.
- **How descendants are found:** `findDescendants()` builds `childrenByParent` from visible entries with `parent_id` at `packages/kernel/src/routes/todos.ts:201-213`, sorts siblings by creation order at `packages/kernel/src/routes/todos.ts:215-221`, and traverses transitively with a `seen` set at `packages/kernel/src/routes/todos.ts:223-235`.
- **Is the supersedes chain correct for descendants?** Yes. `buildRemovedPayload()` copies the descendant payload and sets `payload.supersedes = entry.event.filename` at `packages/kernel/src/routes/todos.ts:252-266`, so each cascaded descendant removal supersedes that descendant's current latest event.
- **Is the parent supersedes chain correct?** It depends on the client request. `buildTodoPayload()` preserves `body.supersedes` if supplied at `packages/kernel/src/routes/todos.ts:239-249`, and `publish()` emits an `event_superseded` message when given one at `packages/kernel/src/routes/todos.ts:300-323`. The route does not require or verify it.
- **Orphan/dangling scenarios:** Normal UI-created deep trees cascade correctly. A dangling legacy/manual state can survive: if an intermediate child is already removed or missing but a deeper visible grandchild still points to it, `findDescendants()` will not traverse through that missing intermediate, so removing the original ancestor will not remove the grandchild. GET already promotes missing-parent children to roots via `buildTodoTree()` at `packages/kernel/src/routes/todos.ts:150-160`, so this is an orphan-preservation edge case rather than a normal UI path.
