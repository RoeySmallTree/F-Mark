# Todos Unification — Chunk 3: Keyboard behavior

## Goal

Add the keyboard model from the spec to the todo tree (left panel, right
panel, and inline TodoCard). All bindings are LOCAL to the focused todo
input — no `useHotkeys` registrations. The compose-bar shortcuts (cmd+P,
cmd+K, etc.) must keep working in their existing surfaces.

## Spec (from the user, restated precisely)

When focus is on a todo's **title** or **description** input:

- **Tab** — indent the current todo to become a child of the nearest item
  **above** it that sits at one level shallower than the current item's
  intended depth. First tab: become child of the first preceding root.
  Each subsequent tab: become child of the first preceding item at the
  next deeper level. **No-op** when there is no preceding item at the
  required level.
- **Shift+Tab** — un-indent. New parent = current parent's parent
  (`grandparent.parent_id`). If already at root, no-op.
- **Enter** on the title input — move focus to the description input
  (within the same todo).
- **Enter** on the description input — commit the todo, then create a
  new empty sibling immediately below it (same `parent_id`) and focus
  its title input.
- **Cmd/Ctrl+Backspace** — remove the current todo (and its children
  via the cascade kernel handles in Chunk 1). If the removed item was
  focused, move focus to the previous visible todo (or the next, if
  there is none above).
- **Up arrow** — move focus to the previous todo at the **same depth**.
  If none, fall through to the previous visible todo regardless of
  depth.
- **Down arrow** — symmetric. Next todo at the same depth; if none, the
  next visible todo regardless of depth.
- **Cmd/Ctrl+Enter** — toggle the current todo's status between
  `"open"` and `"done"` (cross / uncross).

All bindings must **`preventDefault()`** so default browser behavior
(Tab moves focus out of the input, Enter inserts a newline in
contenteditable / arrows move the text caret, etc.) doesn't fire.

## Context — Chunks 1 + 2 landed

### Files in scope
- `packages/renderer/src/cards/TodoItem.tsx` — owns the title +
  description inputs (`titleRef`, missing `bodyRef` — add it). Current
  local key handler is at line 149 (`onLocalKeyDown`) and only handles
  the assignee dropdown Esc.
- `packages/renderer/src/panels/TodoTreeList.tsx` — owns the tree
  context (which item is where, what its siblings are, what its parent
  is). This is where tab/shift-tab/arrow navigation logic must live; it
  exposes callbacks to each TodoItem. Look at `renderNode`,
  `renderDraft`, `updateExisting`, `createDraft`,
  `startRootDraft`, `startChildDraft`.
- `packages/renderer/src/panels/todoPanelUtils.ts` — helpers; add
  tree-walking utilities here (flattened list with `{id, depth, parentId,
  prevId, nextId, prevSameDepthId, nextSameDepthId}`).
- `packages/renderer/src/cards/TodoCard.tsx` — inline card uses
  TodoItem standalone. It has no tree context — the keyboard bindings
  that need siblings/parent (Tab, ShiftTab, ArrowUp/Down to next item)
  must **gracefully no-op** when no tree context is supplied. The
  bindings that operate on just one item (Cmd+Enter toggle, Cmd+Backspace
  remove, Enter to move title→description) must still work.

### Files NOT in scope
- Schema, kernel, shared types — sealed for Chunks 2/3/4.
- Compose bar — Chunk 4.
- `useHotkeys` — keep its registrations untouched. All Chunk 3 bindings
  attach directly to the input via React `onKeyDown`.

## Approach

### 1. Build a tree-walk utility

In `todoPanelUtils.ts`, add:
```ts
export interface FlattenedTodo {
  id: string;
  depth: number;
  parentId: string | undefined;
  /** id of the immediately previous visible item (any depth), or null. */
  prevId: string | null;
  nextId: string | null;
  /** id of the previous item at the SAME depth (skipping deeper
      subtrees). null if none in the visible list. */
  prevSameDepthId: string | null;
  nextSameDepthId: string | null;
}

export function flattenTree(roots: TodoTreeNode[]): FlattenedTodo[] {
  // depth-first preorder, depth computed from parent chain.
}
```

Plus a helper to compute the new `parent_id` for tab / shift-tab:
```ts
/** For Tab: returns the id of the new parent (an item appearing earlier
    in the flat list whose depth == currentDepth). null if no such item
    exists (no-op). */
export function nextIndentParentId(
  flat: FlattenedTodo[],
  selfId: string,
): string | null;

/** For Shift+Tab: returns the new parent id (currentParent.parentId) or
    null when the current item is already at root. The caller passes
    null to mean "root". */
export function nextOutdentParentId(
  flat: FlattenedTodo[],
  selfId: string,
): string | null | "ROOT";
```

(Use `"ROOT"` sentinel to distinguish "promote to root" from "no-op
because already root". Or just have it return `null` and have the caller
check `currentDepth > 0` before calling.)

### 2. Extend TodoTreeList with a navigation context

The tree-level controller already loads/sorts the tree and posts updates.
Add to it:
- A memoized `flat = flattenTree(todos.tree)` whenever todos change.
- A `focusTodo(id: string, field?: "title" | "body")` function that
  scrolls the matching DOM input into view and focuses it. Look up
  inputs via a `Map<string, { title: HTMLInputElement; body: HTMLInputElement }>`
  populated by TodoItem on mount via a `registerInputs` callback prop.
- A `reparentTodo(id, newParentId | null)` function that posts a
  supersession event with the new `parent_id` (omit the field when
  newParentId is null — kernel preserves "no parent" by absence). Use
  the same supersedes-latest-filename pattern that exists in
  `updateExisting`.

Pass to each TodoItem (new optional props — keep them optional so
`TodoCard` inline use remains valid):
```ts
onIndent?: () => Promise<void>;       // = reparentTodo(id, nextIndentParentId)
onOutdent?: () => Promise<void>;      // = reparentTodo(id, nextOutdentParentId)
onFocusPrev?: (sameDepth: boolean) => void;   // focusTodo(prevSameDepthId ?? prevId, ...)
onFocusNext?: (sameDepth: boolean) => void;
onCommitAndCreateBelow?: () => Promise<void>; // commit current, create sibling, focus its title
```

(Names are suggestions; pick what reads cleanly.)

### 3. Wire the bindings inside TodoItem

Add a `bodyRef` (input ref for the description field).

Replace the existing `onLocalKeyDown` with a per-input handler that
covers all the bindings, OR keep `onLocalKeyDown` on the root div and
inspect `event.target` to decide what to do. The per-input approach is
cleaner — wire two `onKeyDown` callbacks on title and body inputs and
a separate one on the root div for assignee-dropdown Esc.

Handler shape:
```ts
function onInputKeyDown(
  event: KeyboardEvent<HTMLInputElement>,
  field: "title" | "body",
): void {
  const isMod = event.metaKey || event.ctrlKey;
  if (event.key === "Tab" && !event.shiftKey) {
    event.preventDefault();
    void onIndent?.();
  } else if (event.key === "Tab" && event.shiftKey) {
    event.preventDefault();
    void onOutdent?.();
  } else if (event.key === "Enter" && !isMod && field === "title") {
    event.preventDefault();
    bodyRef.current?.focus();
  } else if (event.key === "Enter" && !isMod && field === "body") {
    event.preventDefault();
    void onCommitAndCreateBelow?.();
  } else if (event.key === "Enter" && isMod) {
    event.preventDefault();
    void onToggleDone();
  } else if (event.key === "Backspace" && isMod) {
    event.preventDefault();
    void onRemove();
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    onFocusPrev?.(true);
  } else if (event.key === "ArrowDown") {
    event.preventDefault();
    onFocusNext?.(true);
  }
}
```

(Adapt to match house style.)

### 4. Focus management edge cases

- **Newly-created drafts** (auto-first-task, Add task, Add subtask, the
  Enter-on-body "create below") must focus their title input on mount.
  The existing TodoTreeList already auto-focuses drafts; verify the new
  Enter-on-body path also focuses the new draft's title.
- **After remove**: focus moves to the previous visible item; if none,
  the next; if no items left, the bottom "+ Add task" button.
- **After indent/outdent**: focus stays on the same input that just
  fired the key — re-look-up the input ref after the tree re-renders
  (the input element identity may change). Stash the active field
  (`"title" | "body"`) before the reparent post and re-focus the matching
  input after the next `todos.tree` update.

### 5. Tests

Add to `tests/panels/todos.test.tsx` (and/or split into a new
`tests/panels/todos.keyboard.test.tsx` if it gets large):

- Tab on a root item with a preceding sibling → reparent posts with the
  preceding sibling's id as `parent_id`.
- Tab on the first root → no-op (no preceding item).
- Shift+Tab on a depth-1 item → reparent posts with `parent_id` omitted
  (or null) — item becomes root.
- Shift+Tab on a root item → no-op.
- Enter on title input → focus moves to body input.
- Enter on body input → commits + creates sibling below at same depth,
  new draft's title input is focused.
- Cmd+Enter → toggles status post with `done` ↔ `open`.
- Cmd+Backspace → posts `status: "removed"` for that id. (Cascade is
  kernel-side; renderer assertion only checks the single post.)
- ArrowUp / ArrowDown → focus moves to the expected input. Use
  `userEvent.keyboard("{ArrowDown}")` and assert
  `document.activeElement` is the next item's title input.

Inline-TodoCard test (in `tests/cards/todo.test.tsx`): Tab and Arrow keys
on a TodoCard (no tree context) **must not throw and must not** fire
preventDefault — they should be ignored (the optional callbacks are
undefined, so the keydown handler returns early). Enter title→body,
Cmd+Enter, and Cmd+Backspace must still work.

## Constraints

- **No useHotkeys registrations.** All handlers attach directly to the
  input via React `onKeyDown`. This avoids polluting the global hotkey
  registry with per-input chords and avoids the editable-target
  suppression rule entirely.
- **All bound keys must `preventDefault()`.** Default Tab moves focus,
  default Enter inserts a newline (in contenteditable; in a text input
  it submits a form — also bad), default arrows move the caret. Override
  every one.
- **No schema changes.** The reparent operation is a normal POST of a
  todo event with `parent_id` and `supersedes`.
- **No kernel changes.** Already supports `parent_id` updates.
- **No compose changes.** Chunk 4 owns that.
- **No new dependencies.**
- **Don't break the assignee dropdown Esc behavior** that lives on the
  root div's existing `onLocalKeyDown`.
- **Don't touch unrelated dirty work** (preset editor, custom presets,
  settings storage, shortcut registry, density, etc.).
- **Don't stage `.f-mark/sessions/**`** — leave it for the user.

## Definition of done

1. `pnpm -F @f-mark/renderer test` passes (≥ 279 tests + the new
   keyboard assertions).
2. `pnpm -F @f-mark/renderer build` passes.
3. `pnpm -F f-mark test` and `pnpm -F f-mark build` still pass
   (unchanged from Chunk 2).
4. Manual mental walkthrough:
   - Type a title, press Enter → cursor jumps to description.
   - Type a description, press Enter → row commits + a new empty row
     appears below, title focused.
   - Press Tab on a non-first row → row becomes child of the row above.
   - Press Shift+Tab → row moves one level shallower.
   - Press ArrowDown → focus moves to the next row's title.
   - Press Cmd+Enter → row ticks/unticks.
   - Press Cmd+Backspace → row (and any children) removed; focus moves
     to the previous visible row.
5. Inline TodoCard (in feed): Enter title→body, Cmd+Enter toggle,
   Cmd+Backspace remove all work; Tab and arrows are inert (no error,
   no preventDefault).
6. `planning/todos-unification/progress-log.md` has a Chunk 3 section
   with the four required headings + summary.

## Notes

- `flattenTree` and the focus map are the load-bearing primitives.
  Implement them cleanly with unit-test-able shapes — that way the tree
  navigation tests can hit pure functions without needing DOM.
- Re-focusing after a reparent post needs care: the post is async, the
  tree refresh happens via the existing `events.length` polling, and
  the input identity may change because of React reconciliation. Stash
  the `{ id, field }` in a ref before the post; in a `useEffect`
  watching `todos.tree`, if the ref is set and the matching input is
  in the map, focus it and clear the ref.
