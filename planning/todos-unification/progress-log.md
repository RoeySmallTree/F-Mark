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
