# Todos Unification — Chunk 2: Unified TodoItem component + side panels

## Goal

Replace the three different todo renderings (inline feed card, left-panel
list, right-panel list) with **one** unified `TodoItem` component that
implements every visible affordance from the spec:

- Tickable checkbox (already partly done in inline card; bring to panels).
- Remove button (X) — calls cascade-remove via the kernel.
- Clickable assignee badge that opens a participant dropdown.
- "Task title" + "Task description (optional)" placeholders with
  inline-editable fields.
- Auto-create first task when the panel is empty (with title placeholder
  text "First task title").
- "Add task" affordance as the **last item** in the opened list (not a
  top-right "+ Add" button).
- Subtask rendering with indentation based on `parent_id` depth.
- "Add subtask" affordance on each item.
- Default assignee = a random agent participant in the session.

**Out of scope (later chunks):**
- Keyboard behavior (tab indent, enter handling, cmd-backspace, arrows,
  cmd-enter) — Chunk 3.
- Compose-box "Create Todo" button — Chunk 4.

## Context

### Chunk 1 landed — read it
- `TodoPayload` has `parent_id?: string` and `status: "open" | "done" | "wip" | "removed"`.
- `GET /sessions/:id/todos` returns `{ open, wip, done, tree }` where
  `tree: TodoTreeNode[]` is the source of truth for hierarchy.
- `TodoTreeNode { id, title, body?, status, assigned_to?, parent_id?, children }`.
- `parent_id` and `"removed"` are accepted by `POST /sessions/:id/events/todo`.
- Posting `{ status: "removed", supersedes: <latest-filename> }` for a parent
  cascades — kernel emits `"removed"` for every descendant. The renderer
  just posts the parent's remove; the next `GET` reflects the cascade.

### Files in scope (will be heavily modified)
- `packages/renderer/src/cards/TodoCard.tsx` — the inline card. Today
  renders a single todo with a checkbox. Needs to become a thin wrapper
  that uses the new `TodoItem` component (or rendering equivalent) so
  inline + panels share visuals.
- `packages/renderer/src/panels/Todos.tsx` — left panel. Today has the
  top-right "+ ADD" button + a manual list. Must:
  - Remove the top-right "+ ADD" button.
  - Render the todo tree using the new component, indented.
  - Auto-create the first task when the session has zero todos (title
    field appears with "First task title" placeholder, focused).
  - Show an "+ Add task" affordance as the last visible item.
- `packages/renderer/src/panels/right/RightTodos.tsx` — right panel.
  Same treatment as the left panel; it can stay slightly more compact if
  warranted but must use the same `TodoItem` component.

### Files in scope (lightly touched)
- `packages/renderer/src/api/client.ts` — `listTodos()` already returns
  `TodoListResponse` (with `tree`). No client surface changes required.
  Use it as-is.
- CSS: extend `cards.css` (or a new `todos.css` if cleaner) for any new
  visual primitives the unified component needs. Reuse density tokens
  where applicable (e.g. `--todo-head-pad-*`, `--card-body-pad-*`). Do
  NOT introduce new top-level density tokens — Chunk 2 is component work.
- Tests: `tests/cards/todo.test.tsx`, `tests/panels/todos.test.tsx` —
  update to match new structure. Add coverage for: tick, remove, assignee
  dropdown opens and selects, in-place title edit, in-place description
  edit, add-subtask, auto-first-task, indentation rendering.

### Files NOT in scope
- `packages/shared/**` — schema is final for Chunks 2/3/4.
- `packages/kernel/**` — kernel API is final for Chunks 2/3/4.
- `packages/renderer/src/compose/**` — Chunk 4 owns the compose button.
- Any keyboard handling — Chunk 3 owns hotkeys.
- The in-flight preset editor / settings / shortcut / density work — do
  not touch unless a shortcut chip / preset entry is genuinely required
  to wire a NEW feature here, which it shouldn't be.

## Approach

### 1. Build `TodoItem` as the single rendering primitive

Suggested file: `packages/renderer/src/cards/TodoItem.tsx`. Keep
`TodoCard.tsx` for the feed-card chrome (head with avatar/who/when, the
"todo created"/"todo completed" status line) and have it render
`<TodoItem ...>` for the body. The side panels render `<TodoItem ...>`
directly without the head chrome.

Props (sketch — adapt to fit cleanly):
```ts
interface TodoItemProps {
  node: TodoTreeNode;
  depth: number;                       // 0 = root, >=1 = nested
  participants: Record<string, Participant>;
  agentIds: string[];                  // for default-assignee picking
  /** Called when title or body is committed (blur or save). */
  onUpdate: (patch: Partial<TodoPayload>) => Promise<void>;
  /** Toggle status open <-> done. */
  onToggleDone: () => Promise<void>;
  /** Cascade-remove. */
  onRemove: () => Promise<void>;
  /** Add a sibling under the same parent. */
  onAddSibling: () => Promise<void>;
  /** Add a child of THIS node. */
  onAddSubtask: () => Promise<void>;
  /** Change assignee. */
  onReassign: (participantId: string | null) => Promise<void>;
}
```

Render shape:
- Checkbox (current `.todo-check`, restyled).
- Title text — render as an editable contenteditable `<div>` or
  controlled `<input>`. Placeholder text: `"Task title"`. Treat the
  empty/blank value as "needs title".
- Description below title — same treatment, placeholder
  `"Task description (optional)"`.
- Right-side controls: assignee badge (click → dropdown), remove (X),
  "+ subtask" affordance.
- Indentation: `padding-left: calc(<base> + depth * <indent-step>)`. Use
  CSS custom properties so density tokens can scale it cleanly. Don't
  hardcode an indent value scattered across files — define one
  `--todo-indent-step` and reuse.

Editing model: optimistic local state for the editable fields, commit
on blur (or when an explicit save is triggered). On commit, call
`onUpdate` which posts a new todo event with `supersedes: <latestFilename>`.
The `latestFilename` is the filename of the most-recent event for this
todo's id — the parent should pass that in (or include it on the node;
extending `TodoTreeNode` with `_latestFilename` is acceptable and the
kernel can include it in the tree response — but that's a Chunk 1 amendment.
Cheaper: have the parent component maintain an id→latestFilename map
sourced from the renderer's `events` stream).

### 2. Assignee dropdown

Visual: open below the badge on click. Lists all participants in the
session (user + agents). Each option shows avatar + name. Selecting one
calls `onReassign(participantId)`. There's also an "Unassign" row.

Close on outside-click and Escape (the latter via the existing local
key handler in the dropdown, NOT via `useHotkeys` — Chunk 3 owns global
hotkeys).

Default-assignee rule: when a new todo is created (whether via "Add task"
or "Add subtask"), default `assigned_to` to a random agent participant in
the session (pick from `participants` where `kind === "agent"`). If there
are no agents, leave unassigned.

### 3. Auto-create-first-task

When the panel mounts AND `tree.length === 0` AND the session is loaded
AND no add-form is already showing, automatically POST a new todo:
- title: empty (placeholder will read "First task title" — i.e. show
  that special placeholder ONLY when the panel is in "auto-created first
  task" state).
- status: `"open"`.
- assigned_to: random agent (or omitted if none).
- parent_id: omitted.

The title input should focus on mount so the user can type immediately.

This must NOT fire repeatedly. Guard with a ref or a per-session
"auto-created" flag in store state.

### 4. "Add task" as last item

At the bottom of the rendered tree (left panel + right panel + inline
TodoCard list if relevant) render an `+ Add task` row that, when clicked,
becomes a new empty `TodoItem` in editing mode (focused on title). It
posts the todo on first commit.

Critically: **remove the existing top-right "+ ADD" button** in
`Todos.tsx` (`panel-head`). The "+ Add task" affordance lives in the
list, not in the panel header.

### 5. Cascade remove from the UI

The remove (X) button posts `status: "removed", supersedes: <latestFilename>`.
The kernel handles the descendant cascade automatically (Chunk 1). The
renderer should refresh via its existing `listTodos` polling (already
keyed off `events.length` in both panels).

Show a brief confirmation (inline, not a modal) when removing a node that
has children: "Remove this task and N subtasks?" with `Remove` and
`Cancel`. Inline because modals-as-first-thought is banned. Otherwise
remove immediately.

### 6. Agent serialization update

The agent already sees the new `tree` field (Chunk 1). No additional work
in Chunk 2 unless you spot a place where the agent surface still consumes
the flat buckets — flag it in `progress-log.md`.

## Deliverables

- `packages/renderer/src/cards/TodoItem.tsx` (new) — the unified component.
- `packages/renderer/src/cards/TodoCard.tsx` — refactored to use
  `TodoItem` for the body.
- `packages/renderer/src/panels/Todos.tsx` — rewritten to render the
  tree via `TodoItem`, no top-right "+ ADD" button, auto-first-task
  behavior, "+ Add task" as last item.
- `packages/renderer/src/panels/right/RightTodos.tsx` — same treatment.
- CSS: extend `cards.css` (or new `todos.css` imported from
  `styles.css`). Tokens for indentation step. Re-uses density tokens for
  vertical rhythm.
- Tests: extend existing renderer tests to cover the new behaviors.
  Continue to use Vitest + React Testing Library patterns from
  `tests/panels/todos.test.tsx`. At minimum:
  - tick toggles status,
  - clicking X with no children removes immediately,
  - clicking X with children shows inline confirm,
  - assignee badge opens dropdown,
  - selecting an assignee posts the update,
  - empty session auto-creates the first task,
  - + Add task adds a sibling,
  - + Add subtask adds a child (indented by one step),
  - tree indentation reflects `parent_id` depth in the DOM.
- `planning/todos-unification/progress-log.md` — append a Chunk 2 section
  with the four required headings + summary.

## Constraints

- No keyboard handling beyond what's local to a dropdown (Esc to close,
  outside-click to close). All other hotkeys are Chunk 3.
- No compose-bar changes. Chunk 4.
- No schema changes. Chunk 1 is the contract.
- Keep `comfortable` density rendering visually equivalent to today's
  panel where possible — density tokens already scale the right metrics.
- Preserve existing tests' intent — if you rename a class, update the
  test selector; don't delete a test outright unless its premise no
  longer applies (note that in `progress-log.md`).
- No new dependencies.
- Do not touch the unrelated dirty files (preset editor / custom presets
  / settings storage / shortcut registry beyond imports / density CSS /
  shell.css beyond panel rules).
- Do not stage the user's `.f-mark/sessions/**` files (Codex previously
  staged real session data — leave it alone).
- Use Lucide icons that are already imported elsewhere in this codebase
  for consistency (e.g. `X`, `Plus`, `CornerDownRight` for subtask add).
- No emojis in code or copy unless explicitly already in this codebase.

## Definition of done

1. `pnpm -F @f-mark/renderer test` passes (≥ 269 tests; new tests pass).
2. `pnpm -F @f-mark/renderer build` passes.
3. `pnpm -F f-mark test` passes (unchanged from chunk 1 — kernel is not
   touched in chunk 2).
4. `pnpm -F f-mark build` passes.
5. Manual mental walkthrough:
   - Opening Todos panel in an empty session immediately shows one
     "First task title"-placeholder row, focused, with a random agent
     assignee badge.
   - Filling the title and tabbing out (no keyboard logic yet — just
     blur) posts the todo. (Tab default behavior is fine; Chunk 3 will
     turn it into an indent.)
   - Clicking "+ Add task" at the bottom inserts a new empty row.
   - Clicking the "+ subtask" affordance on a row inserts a child,
     indented one step.
   - Removing a parent that has children shows an inline confirm; on
     confirm, the parent and all descendants disappear after the next
     poll.
6. `progress-log.md` is updated.
