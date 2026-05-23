# Todos Unification — Chunk 4: Compose-bar "Create Todo" button

## Goal

Add a "Create Todo" affordance to the compose bar. Clicking it opens an
inline editor (popover or expanded form — your call) with:
- Title field (required).
- Description field (optional).
- Parent dropdown — an indented tree of existing todos, with a "(no
  parent — root task)" option at the top. The dropdown shows the same
  hierarchy the side panel does.
- Assignee dropdown — list of session participants, defaulting to a
  random agent (same rule as Chunks 2/3).

Submitting the form posts a new todo event. If the user's existing
"send-ends-turn" toggle is ON and the user is in **message** mode, the
submit also calls `endTurn()` after the todo is persisted (mirrors the
existing `submitAndMaybeEndTurn` chain pattern).

## Context

### Chunks 1-3 landed
- `TodoPayload` has `parent_id`, `status: "removed"`, `TodoTreeNode`.
- `GET /sessions/:id/todos` returns `{ open, wip, done, tree }`.
- `TodoTreeList` (left + right panels) and `TodoCard` (inline feed) all
  render via the shared `TodoItem`.
- Keyboard model lives on the TodoItem inputs (no global hotkeys for
  todo-internal nav).
- Renderer client: `createClient(...).postTodo(sessionId, body)` accepts
  `{ participant_id, id, title, body?, status, assigned_to?, parent_id?, supersedes? }`.

### Compose bar is being actively redesigned (heads up)

The user is iterating on `packages/renderer/src/compose/Compose.tsx`,
`SendButton.tsx`, and `ModeBar.tsx` in parallel with this work. The
layout has zones (e.g. "Zone 1 — mode setters"), an `.ends-turn-chip`
that lives in `Compose.tsx` (NOT inside SendButton anymore), and a
`.send-cluster` group. **Read the CURRENT state of these files before
touching them.** Do not assume any specific layout from the old
implementation.

### Files in scope
- `packages/renderer/src/compose/Compose.tsx` — add the trigger button
  (in a sensible zone — e.g. alongside Presets / Skills mode buttons),
  the popover/form state, and the submit handler that respects the
  current `messageEndsTurn` toggle.
- A new file for the form/popover itself, e.g.
  `packages/renderer/src/compose/CreateTodoPopover.tsx` (mirror the
  existing `PresetsPopover.tsx` shape so the styling/behavior matches
  other popovers).
- `packages/renderer/src/panels/todoPanelUtils.ts` — add a
  `flattenTreeForDropdown(roots)` helper if `flattenTree` from Chunk 3
  isn't suitable as-is (you may be able to reuse it).
- CSS: extend the appropriate existing file (compose.css if it exists,
  otherwise `shell.css` compose section). Reuse density tokens.
- Tests: extend `tests/compose.test.tsx` with create-todo coverage.

### Files NOT in scope
- Schema / kernel / shared — sealed.
- TodoItem / TodoTreeList / TodoCard — Chunks 2/3 are final for that
  surface. (Read-only access from the new form to load the tree is OK.)
- The keyboard model from Chunk 3 — no changes.
- Unrelated in-flight work (preset editor, custom presets, settings
  storage, shortcut registry beyond imports, density token additions).

## Approach

### 1. Trigger button in Compose.tsx

- Read the current `compose-actions` JSX. Find the cluster where Presets
  and Skills already live (those mode buttons are the visual precedent).
- Add a `<button className="mode-btn">…ListChecks…Create Todo</button>`
  in that cluster. Use a Lucide icon that's already imported elsewhere
  in the renderer (`ListChecks` is a good choice; if not already
  imported anywhere, pick from `CheckSquare`, `Plus`, or check current
  imports).
- Clicking the button toggles open a `CreateTodoPopover` anchored
  beneath the button (same anchor-rect pattern as `PresetsPopover`).
- Don't add a global hotkey for it in Chunk 4. (If you want to add one
  later, that's a separate task — and it'd go through the
  `shortcut-registry.ts` source-of-truth.)

### 2. CreateTodoPopover component

Suggested shape (adapt to fit `PresetsPopover.tsx` conventions):
```tsx
interface Props {
  anchorRect: DOMRect | null;
  onClose(): void;
  /** True iff the user is in message mode AND the ends-turn toggle is on
   *  — used to decide whether to chain endTurn() after creation. */
  endTurnAfter: boolean;
  /** Called after the todo is successfully created. The parent decides
   *  whether to additionally call endTurn(). */
  onCreated(): Promise<void>;
}
```

Render:
- Title input (focused on mount, placeholder "Task title").
- Description input (placeholder "Task description (optional)").
- Parent select. Options:
  - First option: "(no parent — root task)" with value `""`.
  - Then every existing todo, prefixed by `"··· "` (two-character
    indent) per depth level so the visual hierarchy is preserved in the
    `<select>`.
- Assignee select. Options:
  - "(unassigned)" with value `""`.
  - Every participant in the session (`user.name` for user; `agent.name`
    for agents).
  - Default selected value = a random agent's id (use the same
    `pickRandomAgentId` helper from `todoPanelUtils.ts`).
- Submit button: "Create" (primary). Disabled while busy or when title
  is blank.
- Cancel button: "Cancel" (ghost). Closes the popover.
- Keyboard: Enter on title focuses description; Enter on description
  submits; Esc closes (use the same popover close behavior as
  `PresetsPopover`). Tab does NOT do todo-style indent here — this is
  a form, not a todo row.

### 3. Submit flow

Inside the popover, on submit:
1. Validate title non-empty.
2. Build a `PostTodoBody`:
   - `participant_id`: `userId` from store.
   - `id`: `generateTodoId()` from `todoPanelUtils.ts`.
   - `title`: trimmed.
   - `body`: trimmed description, or omit if blank.
   - `status`: `"open"`.
   - `parent_id`: include only if user picked a parent.
   - `assigned_to`: include only if user picked an assignee.
3. `await client.postTodo(sessionId, body)`.
4. Close the popover.
5. Call `onCreated()` so the parent can chain `endTurn()` if
   `endTurnAfter === true`.
6. If anything throws, surface the error inline (red text under the
   form) — don't close the popover so the user can retry.

### 4. Parent wiring

In `Compose.tsx`:
- The "ends turn" toggle state is already tracked as `messageEndsTurn`.
- Pass `endTurnAfter={mode === "message" && messageEndsTurn}` to
  `CreateTodoPopover`.
- `onCreated` should `await endTurn()` when `endTurnAfter` was true.
  Use the existing `endTurn` callback that's already wired for the
  compose row's End-turn affordance.

### 5. Tests

Add to `tests/compose.test.tsx`:
- Clicking the Create Todo button opens a form with title focused.
- Submitting with an empty title is rejected (button disabled or error
  shown).
- Submitting with title only posts `{ id: <td-…>, title, status: "open" }`
  to `/sessions/<id>/events/todo` — assignee defaults to a random agent
  id from the session's participants.
- Selecting a parent submits with `parent_id`.
- Selecting Unassigned submits without `assigned_to`.
- When `messageEndsTurn` is ON and mode is "message", a successful
  create is followed by a `POST /sessions/<id>/events/turn-end` for the
  current user. (Use the existing patterns in this file for mocking
  `fetch` and asserting call shapes.)
- When mode is NOT "message", create succeeds without an end-turn call,
  regardless of the toggle.
- Esc closes the popover.

### 6. Style

Reuse the existing popover frame styles (`.popover`, `.pop-head`,
`.pop-section` from `popovers.css`) so visual continuity holds. For
fields, reuse `.form-input` from `modals.css` and existing form-row
styling. Density tokens already cover the relevant spacing.

## Constraints

- **Read the current compose layout before editing.** The compose bar
  is being actively redesigned by the user in parallel; do not assume
  the layout. Integrate alongside whatever exists.
- **Do not break existing compose tests** — there are 19+ assertions
  in `tests/compose.test.tsx` already. Your additions must coexist.
- **Do not add a global hotkey** for Create Todo in this chunk.
  (`shortcut-registry.ts` stays untouched.)
- **Do not change `TodoItem`, `TodoTreeList`, `TodoCard`, or
  `todoPanelUtils.ts`'s existing exports.** Reading from them is fine;
  modifying them is not (Chunks 2/3 are final).
- **No schema / kernel / shared changes.**
- **No new dependencies.**
- **Don't touch other dirty in-flight files** (preset editor, custom
  presets, settings storage, shortcut registry beyond local imports).
- **Don't stage `.f-mark/sessions/**`** files.
- The "ends turn" toggle now lives in Compose.tsx as
  `.ends-turn-chip` (NOT inside SendButton). Read its current shape —
  the toggle state variable should already be there as
  `messageEndsTurn` / `setMessageEndsTurn` / `handleMessageEndsTurnChange`.
  Don't introduce a parallel toggle.
- Pick a Lucide icon that's already imported in the renderer for the
  new button. If you must import a new one, do it minimally.

## Definition of done

1. `pnpm -F @f-mark/renderer test` passes (≥ 292 tests + your new
   create-todo assertions).
2. `pnpm -F @f-mark/renderer build` passes.
3. `pnpm -F f-mark test` and `pnpm -F f-mark build` still pass
   (unchanged from Chunk 3).
4. Manual mental walkthrough:
   - Compose bar shows a new "Create Todo" affordance alongside Presets
     and Skills.
   - Clicking it opens a small popover with title + description fields,
     a parent dropdown showing the indented tree, and an assignee
     dropdown defaulting to a random agent.
   - Filling the title and clicking Create posts a new todo (visible in
     the Todos panels on next poll).
   - When the user is in message mode with the ends-turn toggle ON,
     creating a todo also ends the turn.
5. `planning/todos-unification/progress-log.md` has a Chunk 4 section
   with the four required headings + summary.

## Notes

- The popover-anchor and outside-click patterns are reusable from
  `PresetsPopover.tsx`; copy the shape rather than reinventing.
- The flat tree dropdown is one of those visual primitives that can
  look noisy — keep the indent prefix subtle (`··· `, `   `, or
  similar). Don't introduce a custom dropdown unless `<select>` reads
  clearly enough for 10-20 items.
