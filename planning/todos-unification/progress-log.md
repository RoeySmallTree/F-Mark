# Todos Unification Progress Log

## Items completed

- Created this progress log for Chunk 1 tracking before implementation begins: [planning/todos-unification/progress-log.md](/home/roey/workspace/F-Mark/planning/todos-unification/progress-log.md:1).
- Extended the shared todo payload with `parent_id` and `"removed"`, and added `TodoTreeNode`: [packages/shared/src/events.ts](/home/roey/workspace/F-Mark/packages/shared/src/events.ts:55).
- Added renderer API types for `TodoListResponse`, `TodoTreeNode`, `parent_id`, and removed-capable todo posts while preserving the flat `TodoBuckets` alias: [packages/renderer/src/api/client.ts](/home/roey/workspace/F-Mark/packages/renderer/src/api/client.ts:39), [packages/renderer/src/api/client.ts](/home/roey/workspace/F-Mark/packages/renderer/src/api/client.ts:45), [packages/renderer/src/api/client.ts](/home/roey/workspace/F-Mark/packages/renderer/src/api/client.ts:117).
- Added shared kernel snapshot/tree helpers that preserve existing newest-first buckets while producing creation-order `tree` nodes with orphan promotion: [packages/kernel/src/routes/todos.ts](/home/roey/workspace/F-Mark/packages/kernel/src/routes/todos.ts:60), [packages/kernel/src/routes/todos.ts](/home/roey/workspace/F-Mark/packages/kernel/src/routes/todos.ts:126), [packages/kernel/src/routes/todos.ts](/home/roey/workspace/F-Mark/packages/kernel/src/routes/todos.ts:176).
- Extended the todo POST schema and payload assembly for `parent_id` and `"removed"`: [packages/kernel/src/routes/todos.ts](/home/roey/workspace/F-Mark/packages/kernel/src/routes/todos.ts:239), [packages/kernel/src/routes/todos.ts](/home/roey/workspace/F-Mark/packages/kernel/src/routes/todos.ts:343).
- Added remove cascade emission from the pre-cascade snapshot using the originating participant for descendant remove events: [packages/kernel/src/routes/todos.ts](/home/roey/workspace/F-Mark/packages/kernel/src/routes/todos.ts:201), [packages/kernel/src/routes/todos.ts](/home/roey/workspace/F-Mark/packages/kernel/src/routes/todos.ts:359).
- Added kernel route tests for `parent_id` persistence, `"removed"` acceptance, cascade removal, assigned filtering on `tree`, and tree nesting/orphan promotion: [packages/kernel/tests/routes/todos.test.ts](/home/roey/workspace/F-Mark/packages/kernel/tests/routes/todos.test.ts:61), [packages/kernel/tests/routes/todos.test.ts](/home/roey/workspace/F-Mark/packages/kernel/tests/routes/todos.test.ts:85), [packages/kernel/tests/routes/todos.test.ts](/home/roey/workspace/F-Mark/packages/kernel/tests/routes/todos.test.ts:195), [packages/kernel/tests/routes/todos.test.ts](/home/roey/workspace/F-Mark/packages/kernel/tests/routes/todos.test.ts:233), [packages/kernel/tests/routes/todos.test.ts](/home/roey/workspace/F-Mark/packages/kernel/tests/routes/todos.test.ts:337).
- Verified `pnpm -F f-mark test -- tests/routes/todos.test.ts` passes; Vitest ran the full kernel suite from that invocation.
- Verified `pnpm -F @f-mark/shared build` passes.
- Verified `pnpm -F f-mark test` passes.
- Verified `pnpm -F f-mark build` passes.
- Verified `pnpm -F @f-mark/renderer test` passes.
- Verified `pnpm -F @f-mark/renderer build` passes.
- Verified the explicit `grep` checks for `parent_id`, `"removed"`, and `TodoTreeNode` pass.
- Verified no diffs were introduced in the forbidden renderer UI files: `TodoCard.tsx`, `Todos.tsx`, or `RightTodos.tsx`.

## Decisions made

- `planning/todos-unification/progress-log.md` did not exist, so I created it with the four required sections before code changes.
- Chose status `"removed"` instead of a `removed: true` boolean as directed by the task doc, keeping removal in the existing supersession/event lifecycle.
- I will introduce a `TodoListResponse` in the renderer client while preserving `TodoBuckets` as the existing flat-bucket alias, so current renderer components can remain untouched in Chunk 1.
- `PostTodoBody.status` now follows `TodoPayload["status"]`, so the API client type stays aligned with the shared schema and can represent `"removed"` without a second hand-maintained union.
- Implemented cascade removal in the existing POST handler rather than adding a new endpoint, because the task asked the remove request itself to trigger descendant remove events.
- `tree` uses creation order while buckets keep newest-first, matching the task's agent-versus-renderer split.
- I applied `assigned_to` filtering to both buckets and `tree`; filtered-out parents behave like missing parents, so matching children are promoted rather than dropped.
- I added defensive cycle detection in tree building and descendant traversal so malformed `parent_id` chains cannot produce cyclic JSON or recursive cascade loops.

## Items deferred

- Renderer UI changes are intentionally deferred because Chunk 1 is limited to data model, kernel routes, and agent-facing tree serialization.
- Renderer test mocks were not updated because preserving the flat `TodoBuckets` alias kept existing renderer tests and call sites working without mock churn.
- Disk deletion and todo id allocation changes were not touched; removal remains event-sourced and ids remain renderer-owned.

## Open questions

- None.

## Summary

- Chunk 1 is complete: shared todo types now model parent links/removal/tree nodes, the kernel POST/GET routes support cascade removal and tree serialization, and renderer client types expose the new response shape without renderer UI changes.

## Chunk 2

### Items completed

- Added the unified `TodoItem` renderer with checkbox toggling, inline title/body fields, assignee dropdown, remove affordance with inline descendant confirmation, add-subtask affordance, and indentation metadata/CSS: [packages/renderer/src/cards/TodoItem.tsx](/home/roey/workspace/F-Mark/packages/renderer/src/cards/TodoItem.tsx:1), [packages/renderer/src/cards/cards.css](/home/roey/workspace/F-Mark/packages/renderer/src/cards/cards.css:681).
- Added shared todo panel helpers and the tree-list controller for loading `tree`, posting superseding todo events, auto-creating the first blank task, handling local draft rows, and assigning new todos to a random agent by default: [packages/renderer/src/panels/todoPanelUtils.ts](/home/roey/workspace/F-Mark/packages/renderer/src/panels/todoPanelUtils.ts:1), [packages/renderer/src/panels/TodoTreeList.tsx](/home/roey/workspace/F-Mark/packages/renderer/src/panels/TodoTreeList.tsx:1).
- Refactored the inline feed card to keep only its feed chrome and render `TodoItem` for the todo body: [packages/renderer/src/cards/TodoCard.tsx](/home/roey/workspace/F-Mark/packages/renderer/src/cards/TodoCard.tsx:1).
- Reworked the left Todos panel to remove the top-right `+ ADD` button and render the unified tree list with `Add task` as the bottom row: [packages/renderer/src/panels/Todos.tsx](/home/roey/workspace/F-Mark/packages/renderer/src/panels/Todos.tsx:1).
- Reworked the right Todos panel to use the same unified tree list in compact mode while preserving count chips: [packages/renderer/src/panels/right/RightTodos.tsx](/home/roey/workspace/F-Mark/packages/renderer/src/panels/right/RightTodos.tsx:1).
- Updated renderer tests for todo card and todo panels to cover toggling, removal, descendant confirmation, assignee selection, inline edits, auto-first-task creation, add-task drafts, add-subtask drafts, and DOM indentation: [packages/renderer/tests/cards/todo.test.tsx](/home/roey/workspace/F-Mark/packages/renderer/tests/cards/todo.test.tsx:1), [packages/renderer/tests/panels/todos.test.tsx](/home/roey/workspace/F-Mark/packages/renderer/tests/panels/todos.test.tsx:1).
- Verified `pnpm -F @f-mark/renderer test -- tests/cards/todo.test.tsx tests/panels/todos.test.tsx` passes; in this workspace Vitest ran the full renderer suite.
- Verified `pnpm -F @f-mark/renderer build` passes.

### Decisions made

- Kept `TodoCard` as feed chrome only, with all editable todo affordances delegated to `TodoItem`, so inline and panel todos share the same visible body implementation.
- Used a shared `TodoTreeList` panel component to keep left and right panel behavior aligned while allowing the right panel to remain compact.
- Stored auto-created blank titles as a single blank string for POST compatibility with the current kernel `title` `minLength: 1` schema, while rendering whitespace-only titles as empty fields with the required placeholder.
- Kept latest todo filenames in a merged event-stream/local-post map so immediate edits after auto-create or draft-create can still supersede the newest known event.
- Commit callbacks send the current local title/body pair, not only the edited field, so a quick title edit followed by a description edit does not revert the title while waiting for the next todo refresh.
- Scoped Escape handling to the assignee dropdown component and used outside-click close only for that local dropdown behavior.

### Items deferred

- Chunk 3 keyboard behavior remains untouched: tab indent, enter handling, cmd-backspace, arrow navigation, and cmd-enter were not implemented.
- Chunk 4 compose-bar behavior remains untouched; no compose `Create Todo` button was added.
- No schema, kernel, shared type, shortcut registry, preset editor, custom preset, settings storage, compose, or unrelated density-token changes were made for Chunk 2.
- Agent serialization needed no additional renderer work because Chunk 1 already exposed the `tree` field.

### Open questions

- None.

### Summary

- Chunk 2 is complete: todos now render through one shared `TodoItem` body across the feed, left panel, and right panel, with tree indentation, inline editing, assignee reassignment, removal, auto-first-task creation, and bottom-row add affordances covered by renderer tests and build verification.

## Chunk 3

### Items completed

- Added tree navigation helpers for depth-first flattening, same-depth neighbors, indent parents, and outdent parents: [packages/renderer/src/panels/todoPanelUtils.ts](/home/roey/workspace/F-Mark/packages/renderer/src/panels/todoPanelUtils.ts:71).
- Added optional local keyboard callbacks, title/body input registration, body focus refs, and per-input keydown handling to `TodoItem`: [packages/renderer/src/cards/TodoItem.tsx](/home/roey/workspace/F-Mark/packages/renderer/src/cards/TodoItem.tsx:24).
- Added `TodoTreeList` focus plumbing with an input ref map, flattened-tree navigation, reparenting posts, remove focus fallback, and Enter-on-description sibling draft creation: [packages/renderer/src/panels/TodoTreeList.tsx](/home/roey/workspace/F-Mark/packages/renderer/src/panels/TodoTreeList.tsx:101).
- Added renderer tests for Tab/Shift+Tab reparenting no-ops and updates, Enter focus/commit/create-below, Cmd/Ctrl+Enter toggle, Cmd/Ctrl+Backspace remove, arrow navigation, and inline `TodoCard` keyboard behavior: [packages/renderer/tests/panels/todos.test.tsx](/home/roey/workspace/F-Mark/packages/renderer/tests/panels/todos.test.tsx:1), [packages/renderer/tests/cards/todo.test.tsx](/home/roey/workspace/F-Mark/packages/renderer/tests/cards/todo.test.tsx:1).
- Verified `pnpm -F @f-mark/renderer test -- tests/cards/todo.test.tsx tests/panels/todos.test.tsx` passes; in this workspace Vitest ran 292 renderer tests.
- Verified `pnpm -F @f-mark/renderer test` passes with 292 renderer tests.
- Verified `pnpm -F @f-mark/renderer build` passes.
- Verified `pnpm -F f-mark test` passes with 188 kernel tests.
- Verified `pnpm -F f-mark build` passes.

### Decisions made

- Kept every new binding local to the todo title/description inputs via React `onKeyDown`; no `useHotkeys` registrations or shortcut registry entries were added.
- Preserved inline `TodoCard` standalone behavior by leaving tree-only callbacks optional, so Tab and arrow keys are inert there while Enter title-to-description, Cmd/Ctrl+Enter, and Cmd/Ctrl+Backspace still work.
- Used `parent_id` omission for root outdent posts by teaching the existing todo update body builder to distinguish an explicit `parent_id: undefined` patch from preserving the current parent.
- Enter on a description commits the current local title/body values before opening a focused local sibling draft, so quick edits are not lost while waiting for a tree refresh.
- Added a focused draft insertion point (`afterId`) only inside `TodoTreeList`, keeping the kernel tree shape and todo schema unchanged.

### Items deferred

- Chunk 4 compose-bar todo creation remains untouched.
- No schema, kernel, shared type, compose-bar, `useHotkeys`, shortcut registry, settings storage, preset editor, custom preset, or density CSS work was included in Chunk 3.
- No `.f-mark/sessions/**` files were staged or edited.

### Open questions

- None.

### Summary

- Chunk 3 is complete: todo title and description inputs now own the requested local keyboard behavior across the left panel, right panel, and inline todo cards, with tree navigation/focus helpers covered by renderer tests and full renderer/kernel verification passing.

## Chunk 4

### Items completed

- Read the current task spec, progress log, dirty working tree status, and live compose redesign files before making compose-bar edits.
- Added a Zone 2 compose-bar Create Todo launcher and wired it to the existing `messageEndsTurn`/`endTurn` flow without adding a parallel toggle: [packages/renderer/src/compose/Compose.tsx](/home/roey/workspace/F-Mark/packages/renderer/src/compose/Compose.tsx:171), [packages/renderer/src/compose/Compose.tsx](/home/roey/workspace/F-Mark/packages/renderer/src/compose/Compose.tsx:341), [packages/renderer/src/compose/Compose.tsx](/home/roey/workspace/F-Mark/packages/renderer/src/compose/Compose.tsx:398).
- Added `CreateTodoPopover` with focused title entry, optional description, indented parent select loaded from `/todos`, participant assignee select defaulting to a random agent, inline errors, Enter/Escape behavior, and todo POST submission: [packages/renderer/src/compose/CreateTodoPopover.tsx](/home/roey/workspace/F-Mark/packages/renderer/src/compose/CreateTodoPopover.tsx:42), [packages/renderer/src/compose/CreateTodoPopover.tsx](/home/roey/workspace/F-Mark/packages/renderer/src/compose/CreateTodoPopover.tsx:109), [packages/renderer/src/compose/CreateTodoPopover.tsx](/home/roey/workspace/F-Mark/packages/renderer/src/compose/CreateTodoPopover.tsx:216).
- Added a dropdown-specific tree flattener without changing existing helper exports: [packages/renderer/src/panels/todoPanelUtils.ts](/home/roey/workspace/F-Mark/packages/renderer/src/panels/todoPanelUtils.ts:81), [packages/renderer/src/panels/todoPanelUtils.ts](/home/roey/workspace/F-Mark/packages/renderer/src/panels/todoPanelUtils.ts:127).
- Added Create Todo popover styling on top of the existing popover/form primitives: [packages/renderer/src/popovers/popovers.css](/home/roey/workspace/F-Mark/packages/renderer/src/popovers/popovers.css:309).
- Added compose tests for opening/focus, empty-title rejection, title-only creation, parent selection, unassigned creation, message-mode turn-ending, non-message no-turn behavior, and Escape close: [packages/renderer/tests/compose.test.tsx](/home/roey/workspace/F-Mark/packages/renderer/tests/compose.test.tsx:499).
- Verified `pnpm -F @f-mark/renderer test` passes with 300 renderer tests.
- Verified `pnpm -F @f-mark/renderer build` passes.
- Verified `pnpm -F f-mark test` passes with 188 kernel tests.
- Verified `pnpm -F f-mark build` passes.

### Decisions made

- Integrated the Create Todo launcher into the current Zone 2 augment cluster next to Presets and Skills, matching the live compose redesign instead of the older flat action row.
- Kept Create Todo popover visibility local to `Compose.tsx` to avoid widening the global popover key union for a single compose-owned form; opening Presets and Create Todo closes the other surface.
- Kept `messageEndsTurn` in `Compose.tsx` as the single source of truth and used the existing `endTurn` callback after successful todo persistence when `mode === "message"`.
- Reused `pickRandomAgentId(getAgentIds(participants))` for the default assignee so the compose form matches the Todo panel/random-agent behavior from earlier chunks.
- Used a plain `<select>` for parent choice with pre-order flattened tree labels, keeping the hierarchy readable without introducing a custom dropdown or keyboard model.

### Items deferred

- No global hotkey or shortcut-registry entry was added for Create Todo.
- No schema, kernel, shared, `TodoItem`, `TodoTreeList`, `TodoCard`, preset editor, custom presets, settings storage, or unrelated density/CSS work was included.
- No `.f-mark/sessions/**` files were staged or edited.

### Open questions

- None.

### Summary

- Chunk 4 is complete: the compose bar now has a Create Todo affordance that opens an anchored form, posts new todos with optional parent/assignee data, and chains the existing message-mode end-turn flow when the user’s current send-ends-turn preference is enabled.
