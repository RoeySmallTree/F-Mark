# Shortcuts: reconcile implied affordances with actual bindings

## Goal

There are multiple places in the renderer where a **keyboard shortcut is
implied** by the UI (a `.kbd-chip`, a `.kbd` element, a hint string like
"⌘K", "Ctrl+P", "Enter to send", "Esc to close") but the **actual hotkey
registration is missing, mis-targeted, or broken** — so pressing the key does
nothing.

Find every such drift and fix it. After this task lands, every shortcut
chip / kbd hint visible in the UI must correspond to a real, working
binding, and every binding listed in the canonical registry must work in
the surface where it's documented.

## Context

### The source-of-truth registry
`packages/renderer/src/modals/settings/shortcut-registry.ts` defines the
"public" shortcut list. Today it has 7 entries:

- `$mod+/` — Toggle comment mode
- `$mod+N` — Toggle named mode
- `$mod+Enter` — Send / end turn
- `Escape` — Close modal / clear comment target
- `$mod+K` — Command palette
- `$mod+P` — Presets palette
- `$mod+Shift+K` — Skills palette

The Settings → Shortcuts tab renders this list. So when a user opens it,
**each entry must actually fire when pressed** in the documented context.
A test asserts the section renders one row per entry — that test does NOT
check whether each binding works at runtime. You will.

### The hook
`packages/renderer/src/hooks/useHotkeys.ts` is the registration mechanism.
Pattern grammar: `$mod+...` (resolves to Cmd on macOS, Ctrl elsewhere),
`Escape`, `Enter`, `Shift`, `Alt`, single-letter keys, etc. Editable-target
suppression: chords without `$mod` don't fire while focus is in
input/textarea/contenteditable.

### Surfaces that currently call `useHotkeys`
Grep found these (use them as a starting set — there may be more):
- `compose/Compose.tsx`
- `compose/ModeBar.tsx`
- `modals/ModalRoot.tsx`
- `modals/CmdKModal.tsx`
- `modals/SkillsPaletteModal.tsx`
- `modals/PresetEditorModal.tsx`
- `modals/settings/SettingsModal.tsx`
- `popovers/Popover.tsx`
- `panels/Sessions.tsx`
- `panels/Named.tsx`
- `panels/Todos.tsx`
- `panels/right/RightNamed.tsx`
- `overlays/CommentThreadOverlay.tsx`

### What "implied but not applied" looks like — patterns to grep
1. `.kbd-chip` / `.kbd-row` / `<kbd>` elements showing a key/chord, with no
   matching `useHotkeys` call in scope (or with a chord that doesn't match
   what the chip displays).
2. Tooltip text or button labels like `"⌘K"`, `"Cmd+P"`, `"Ctrl+Enter"`,
   `"Esc"`, `"Enter to send"`, `"⏎"`, `"⌫"` in JSX.
3. Hardcoded chord-display strings (`"⌘"`, `"Ctrl+"`, `"Shift+"`) and the
   `chordToKeys()` helper output — anywhere either is rendered and the key
   chord isn't actually wired.
4. Registry entries (in `shortcut-registry.ts`) whose chord doesn't appear
   in ANY `useHotkeys` call — orphaned entries.
5. Hotkeys registered in a component that's never mounted in the active
   layout (or only mounted behind a flag) — registered but dead.
6. Modals/popovers showing an `Esc` hint but not calling `useHotkeys` for
   Escape — relying on the global ModalRoot handler may or may not cover
   their case; verify.
7. Comment thread overlay or named panels showing `Enter`/`⌘+Enter` hints
   that don't actually submit.

### What's NOT in scope
- Adding new shortcuts that aren't documented or implied anywhere.
- Refactoring `useHotkeys` itself — it works.
- Changing the registry's chord grammar (`$mod+...`).
- Touching `packages/kernel/**` or `packages/shared/**` — renderer only.
- Touching the in-progress density CSS work or the unrelated dirty files
  (`packages/renderer/src/modals/SkillsPaletteModal.tsx` — only if it's
  affected by this task — and `packages/renderer/src/modals/skills/sources.ts`
  / `packages/renderer/src/popovers/Popover.tsx`).
  Wait: SkillsPaletteModal and Popover are very likely IN scope for this
  task because they own shortcut-bearing surfaces. **If you find drift in
  those files**, fix it but only the shortcut-related lines — do not undo
  or otherwise touch their pre-existing diff.

## Approach

### Step 1 — Inventory the drift

Build a punch list under `planning/shortcuts/inventory.md`. For each finding:
- **File:line** of the implied affordance (the chip / hint / label).
- **Chord it implies** (as a `$mod+...` pattern).
- **Registration status**: (a) registered correctly in the same component,
  (b) registered in a parent / ancestor that's mounted alongside, (c) NOT
  registered anywhere, (d) registered with the wrong chord, (e) registered
  but suppressed (e.g., editable-focus suppression hits because the chord
  lacks `$mod`).
- **Proposed fix**: which side to change. Default to **add the binding**
  rather than **remove the chip** unless the chip is wrong (chord shown
  doesn't match a real product behavior) — then remove the chip.

### Step 2 — Fix in priority order

1. Registry entries that don't work → highest priority. Users see them in
   Settings as a contract.
2. Modal/popover Esc hints that don't fire → medium. Users hit Esc by
   instinct.
3. Inline `⌘K` / `⌘P` etc. chips in toolbars and buttons that don't fire →
   medium.
4. `Enter` / `⌘+Enter` send hints in compose / comment / named panels →
   high (it's the primary action).
5. Cosmetic `.kbd-chip` decorations with no functional intent → low; fine
   to leave OR remove the chip.

### Step 3 — Test where reasonable

The codebase uses Vitest + @testing-library/react. Where a binding is the
primary action of a component already covered by a test
(`tests/compose.test.tsx`, `tests/modals/cmdk.test.tsx`, etc.), add a
minimal `fireEvent.keyDown(...)` assertion that the chord triggers the
expected store action / callback. **Don't write tests for cosmetic chips.**

Keep test additions surgical — one or two assertions per binding-under-fix.
Do not refactor existing tests.

## Deliverables

- `planning/shortcuts/inventory.md` — your punch list with file:line refs.
  Keep it after the work as documentation.
- `planning/shortcuts/progress-log.md` — your running log per the standard
  buddy-do contract (Completed / Decisions / Deferred / Open questions).
- Renderer source changes that close the drift. Likely a mix of:
  - Adding `useHotkeys` calls (or extending existing maps) in components
    that show an unwired chip / hint.
  - Removing a chip / hint where the implied behavior was never real and
    isn't worth implementing.
  - Updating a chord in a chip when registry + binding agree but the chip
    text was wrong.
  - Possibly extending the registry if a chord IS wired and IS used
    pervasively but isn't documented (only with strong justification).
- Surgical test additions where a fix sits inside a component that already
  has tests.

## Constraints

- **Renderer only.** No changes to `packages/kernel/**` or
  `packages/shared/**`.
- **No new dependencies.**
- **Don't redesign `useHotkeys` or its grammar.** Use it as it stands.
- **Don't break existing tests.** `pnpm -F @f-mark/renderer test` must
  pass at the end. 242 tests today.
- **Don't touch the density CSS work** in flight on this branch. Stay
  out of `themes/density.css`, `styles.css`, `shell.css`, `cards.css`,
  `modals.css`, `modals/cmdk/cmdk.css`, `popovers/popovers.css` unless a
  shortcut-related JSX file forces a tiny CSS tweak (very unlikely).
- **Be conservative with cross-platform symbols.** The registry's
  `chordToKeys()` already handles ⌘ vs Ctrl. Don't hardcode "⌘" or "Ctrl"
  in new JSX — call into `chordToKeys` or render whatever the existing
  pattern in that file does.
- **Don't suppress the editable-target rule** without thought. If a chord
  needs to fire while typing, it must include `$mod`. If you find a hint
  in compose that doesn't fire because of this, the fix is usually to
  prefix `$mod+` and update the chip text — not to bypass the rule.

## Definition of done

1. `pnpm -F @f-mark/renderer test` passes (≥ 242 tests; any new tests you
   add also pass).
2. `pnpm -F @f-mark/renderer build` passes.
3. Every entry in `SHORTCUTS` (the registry) has at least one corresponding
   `useHotkeys` registration that fires in the documented context.
   Document the mapping in `inventory.md`.
4. Every `.kbd-chip`, `<kbd>`, or shortcut-shaped label in renderer JSX is
   either (a) backed by a working `useHotkeys` registration that matches
   the displayed chord, or (b) removed. Document each in `inventory.md`.
5. `inventory.md` exists, lists every drift you found, and shows which
   side you fixed for each.
6. `progress-log.md` exists with the standard four sections.
7. No changes outside `packages/renderer/` (and the planning folder).
