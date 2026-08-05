# Sweep Remediation Plan — 2026-08-05

Covers all 34 findings from `docs/ui-sweep/2026-08-04-ui-sweep.md`, plus the 6 carried Cluster A items.

## The organising principle

34 findings are not 34 fixes. They collapse into **7 mechanisms**, and each mechanism ends with an
**enforcement artifact** — a type or a test — so the class cannot silently return. That is what makes
this coherent rather than a patch pile.

The sweep's own evidence justifies this: the same defect shipped six times because the guard lived on
the *control* instead of the *action*, and nothing in the type system or the tests noticed. Fixing six
call sites without an enforcement artifact recreates the trap at the seventh.

**Every cluster below must land with its enforcement artifact in the same commit.** A fix without one
is not done.

---

## C1 · The destructive-action contract
**Covers:** BL3, BL4, BL5, B2, M15, and the carried Cluster A set (B1, H1, H2, M2, A6).
**Enforcement artifact:** the `ConfirmedIntent` branded type — an unconfirmed destructive call
becomes a **compile error**.

### Mechanism
`feature/destructive-action-contract` (`7558f71`, 16 commits, never pushed) already built this:
`useConfirmDestructive` returns a branded `ConfirmedIntent`, and `goodbye` requires one, so skipping
confirmation fails to typecheck. It currently protects 1 of 6 destructive actions.

**Do not re-implement it. Rebase that branch onto Aurora and extend its coverage.**

Extend `ConfirmedIntent` to require confirmation at:

| Action | Site | Note |
| ------ | ---- | ---- |
| `killTerminal` | `useRightTerminalController.ts:146-167` | BL4 — verified 1-click destroy of a live shell |
| agent `close()` | `useAgentTerminalsController.ts:144-174` | B2 — **two** entry points (`AgentTerminals.tsx:57-65` and `:76-78`) |
| `removeRuntime` | `useRuntimeActions.ts:54-57` | M15 |
| unrecoverable revert | `useHunkActionsBarController.ts:42-58` | BL5 — see the predicate below |
| todo remove w/ descendants | `cards/todoItem/` | BL3 — see below, needs care |

### BL5 needs a shared predicate, not a blanket confirm
`fileActionLabel` (`hunkActionsBar/model.ts:14-24`) **already branches on exactly the right
distinction** — `untracked|added|binary-untracked|binary-added` → "Delete file" (unrecoverable);
everything else → "Restore file" (recoverable from git). `hunkActionLabel` does **not** — it returns
"Revert hunk" for the same statuses, which is why the hunk control destroys a file under a soft label.

Extract that branch once:

```ts
/** True when reverting cannot be undone: git has no copy to restore from. */
export function isUnrecoverableRevert(status: GitFileStatus): boolean
```

Then use it in three places:
1. `fileActionLabel` — replace the inline branch (no behaviour change)
2. `hunkActionLabel` — return "Delete file" for unrecoverable statuses, fixing the misleading label
3. `runRevert` — require `ConfirmedIntent` only when `isUnrecoverableRevert(status)`

**Deliberately NOT confirming the recoverable path.** Adding a dialog to "Restore file" would train
users to click through it, which is how the unrecoverable one gets clicked through too. The
confirmation must be rare enough to mean something.

### BL3 is not a simple swap — note the signature
`useTodoItemController.remove()` calls `onRemove(undefined, inputs.values())`; the keyboard path calls
`onRemove(field, values)` — the `field` is needed for focus management after removal. That difference
is *why* `useTodoItemInputs` was wired to the raw prop and the bug exists.

Fix: build the guarded closure so it **preserves `field`**, and pass that into `useTodoItemInputs`:

```ts
// useTodoItemController.ts — one guarded function, both callers
async function guardedRemove(field: TodoField | undefined, values: TodoValues) {
  if (descendants > 0 && !confirmingRemove) { setConfirmingRemove(true); return; }
  await onRemove(field, values);
  setConfirmingRemove(false);
}
```

Note the confirm here is the existing **inline** `TodoConfirmRemove`, not `window.confirm`. Triggering
it from the keyboard is correct and keeps the interaction keyboard-native — but verify the confirm UI
receives focus, or a keyboard user raises a dialog they cannot see or reach.

### Blast radius
- Rebasing 16 commits onto Aurora: expect conflicts in the agent/terminal files Aurora also touched.
- Cluster A renamed the kernel's misleadingly-named "confirm token" to `requestNonce`. **That rename
  is load-bearing** — `getConfirmToken` reads like human confirmation and is a server-side nonce. Keep it.
- Every newly-guarded call site gains a required argument → all callers must be updated. That is the
  point: the compiler enumerates them for you.

### Verification
- Typecheck is the primary proof: removing a confirmation must fail to compile.
- Re-run the U9 fixture: untracked file → confirm appears → Cancel leaves the file → Accept deletes it.
- Re-run BL4's round trip: spawn terminal, kill, confirm dialog appears first.

---

## C2 · The popover close contract
**Covers:** H2, H3, H4, M8.
**Enforcement artifact:** a test that asserts every popover mount site routes close through the wrap.

### Mechanism — invert the ownership
The current design wraps at the **mount site**. Three bypasses prove that is the wrong seam: openers
and orchestrators close popovers via raw zustand setters, unmounting the subtree before `closing` can
apply.

| Bypass | Site |
| ------ | ---- |
| Skills select-item | `ComposeRootPopovers.tsx:36-39` → raw `closeSkillsPopover()` |
| Compose settings toggle | `useComposePopovers.ts:84-87` → raw `closePopover()` |
| Log filter toggle | `useRightLogController.ts:58-65` → raw `closePopover()` |

Two of three are **toggle buttons that close-if-already-open** — a category the original design never
considered.

**Fix: move the delay into the store action itself.** `closePopover` / `closeSkillsPopover` become
async-aware: set a `closing` flag, then clear the key after the exit duration. Every caller — mount
site, opener, orchestrator — gets the animation for free, because there is no longer an unwrapped path
to call.

This also fixes **M8**: the @-mention picker renders a plain div rather than the shared `Popover`, so
it has no backdrop and no Escape. Move it onto `Popover` (which correctly declares
`aria-modal="false"`) and it inherits both, plus the store-level exit.

### Correct the false comment
`popovers/usePopoverExit.ts:6-15` states *"the mount site is the only place that owns every close
path, so it is the only place the wrap is complete."* **This is false and must be rewritten** — it is
what would stop the next reader from finding these three bypasses.

### Blast radius
- Store-level delay means `activePopover.key` stays set ~160ms after a close is requested. Any code
  reading that key to decide "is a popover open" now sees `true` during the exit. Audit those readers.
- Reduced motion must still close immediately — `usePopoverExit` already handles this; preserve it.
- The 9 tests adapted during the sweep (`waitFor` around close assertions) stay valid.

---

## C3 · The focus and keyboard contract
**Covers:** BL1, H6, M1, M6, M13.
**Enforcement artifact:** extend `tests/quality-floor.test.ts` — it already guards the ring; give it
three more rules.

### C3a · `aria-modal` (BL1) — two honest options
No modal implements focus containment, yet all 9 declare `aria-modal="true"`. Either:
- **(a)** implement a shared `useFocusTrap(ref)` — trap Tab, restore focus to the trigger on unmount; or
- **(b)** drop `aria-modal` to `false` everywhere, matching what popovers already honestly declare.

**Recommend (a).** These are real modals; (b) would be honest but worse for users. Ship (a) as one
hook applied to all 9, not 9 implementations.

Priority within this: the **Preset editor leaking focus onto "Restart kernel"** is the case that turns
an a11y gap into a hazard, and C1 will have put a confirm on the destructive controls by then — so
land C1 first and this becomes strictly less dangerous.

### C3b · Roving tabindex (M1, H6)
Seven widget groups declare `role="tablist"` / `role="radiogroup"` and implement no keyboard pattern:
the three top-bar groups, the right-panel strip, the Settings sidebar, and the Theme/Font/Density
radios. `TabItem` is worse — a `<div role="tab">` with **no `tabIndex` at all**, unreachable entirely.

One shared `useRovingTabIndex(items, activeIndex)` hook, applied to all seven.

⚠️ **`TabItem` is also `draggable`** with a full drag-reorder implementation. Adding `onKeyDown` must
not swallow drag handlers, and adding `tabIndex` changes the tab order around the existing Pin/Close
buttons. Verify drag-reorder still works after.

### C3c · The suppressed ring (M6)
`.panel-search input { outline: 0 }` (`shell.css:2867-2871`) at specificity `0-1-1` beats the global
`:where()` rule's effective `0-1-0`. **Fix: delete the `outline: 0` line.** The global ring then
applies. No replacement rule needed.

`interaction.css:29-32` already states the rule — *"Never suppress the ring without replacing it"* —
and nothing enforces it. Add that as a quality-floor test: flag any rule setting `outline: 0|none` on
a focusable selector without a `:focus-visible` replacement in the same file.

**This is the third blind spot in the guard I wrote during this session** — it catches transitioned
rings and a deleted global reset, but not suppression. Closing it here.

### C3d · Touch targets (M13)
Command palette and settings buttons are 15×32px; `+` is 28×28px. Raise hit area to ≥44px via padding
or a `::before` overlay — **without** changing visual size, which is deliberate in a dense tool.

---

## C4 · Responsive shell (BL2) — the expensive one
**Covers:** BL2 (and resolves the 375px symptoms U1 and U3 filed separately).

The widths are **not CSS**. `themes/layout.ts:128-129` sets `[paneIds.leftPanel]: 288` and
`[paneIds.rightPanel]: 340` as JS constants feeding the dock layout engine — the same engine that owns
36 placements and drag-to-dock. **A media query cannot fix this.**

Options, cheapest first:
1. **Clamp in the layout engine** — derive pane width as `min(constant, viewport * fraction)` so the
   centre pane keeps a floor. Smallest change; fixes the 0-width catastrophe; does not give a real
   mobile layout.
2. **Collapse-to-overlay below a breakpoint** — side panels become slide-over drawers under ~1024px.
   Correct behaviour, significantly more work, touches the dock engine's placement math.

**Recommend (1) now, (2) as its own project.** The Blocker is "controls are unclickable", and a floor
on the centre pane fixes exactly that. Do not let a mobile-layout project block this branch.

**Blast radius:** the dock engine persists layout to localStorage (`dock-migration-v5` tests exist).
Any width change must not corrupt or invalidate saved layouts — check the migration tests.

---

## C5 · Event semantics
**Covers:** M2, M3, M14 (context).
**Enforcement artifact:** a shared predicate in `@f-mark/shared`, used by both renderer and kernel.

### M2 · Unify the two deletion mechanisms
F-Mark has two, and only one is understood outside the renderer:

| Mechanism | Shape | Honoured by |
| --------- | ----- | ----------- |
| Generic tombstone | `removed: true` frontmatter | `kernel/events/visible.ts:6-10` |
| Comment removal | content marker `"_removed_"` | **renderer only** (`comments/commentMarkers.ts:5`) |

Consequence: a removed comment is a *visible* prose event containing `_removed_` to search, the inbox,
and all 23 `fmark_*` MCP tools — the agent-facing surfaces of an agent-collaboration product.

**Fix:** make comment removal write the documented `removed: true` tombstone. Keep reading the content
marker for backward compatibility with existing logs (the log is append-only — old markers are
permanent and must still render correctly).

**Blast radius — this is the highest-risk item in the plan.** `getProseRole()`
(`shared/src/proseRoles.ts`) resolves prose role by frontmatter shape with a documented precedence
including `append_to` + `removed`. Adding `removed: true` to comments changes which branch they hit.
Hand-trace every producer and consumer before changing it — this is exactly the invariant-change class
that reviewers miss.

### M3 · Double-submit guard for comments
Compose's Send is guarded by `inFlightRef` (verified: 3 rapid clicks → 1 POST). The comment composer is
not (verified from artifacts: two identical events 1ms apart). **Reuse `inFlightRef`, do not invent a
second pattern.** In an append-only log a duplicate is permanent — only maskable, never removable.

---

## C6 · States and feedback
**Covers:** H1, H5, M5, M7, M9, M10, M11, M12, M16.

| # | Fix |
| - | --- |
| **H1** | Add an `everything`-mode empty vignette in `FeedEmptyState.tsx:39-54`. **The `loading` flag is already respected at line 20** — the bug is that the catch-all reuses `FeedLoadingState`. Do not "fix the loading check". |
| **H5** | `state/fileViewerTabs.ts:48-71` `close()` must consult dirty state. `FileEditBar.tsx:48` already renders "Unsaved changes", so the state exists — thread it into close and prompt (or autosave) when dirty. *Needs one more trace: locate the owner of `dirty`.* |
| **M5** | `useSessionRename` / `useSessionDelete` must `setError(null)` on success. Only `useSessionSelection.ts:80` clears it today. |
| **M7** | `AccessRequestCard.tsx:99` returns before computing `time`. Return `[status, time].join(" · ")` for non-approved. **Preserve the deliberate scope omission** — the comment at :83-93 explains it, and "denied once" genuinely misreads. |
| **M9** | Extract the flash from `FeedRows.tsx` (`ANCHOR_FLASH_CLASS`, 1200ms) into a shared helper; use it in `prosePanelUtils.ts:23-28` too. Also addresses the recorded "three duplicated transient-flash implementations". |
| **M10** | Add `aria-invalid` + `aria-describedby` on the name field and a `title` on the disabled Send. |
| **M11** | Add a "no todos match this filter" state — distinct from genuinely empty. |
| **M12** | `useAutoFirstDraft` — `setDraft(null)` runs before the async `loadTodos()` resolves, so the stale snapshot re-triggers. Gate on the in-flight reload. |
| **M16** | Dispose the Monaco diff model before the revert mutation; render a designed "file was deleted" state instead of the raw `"failed to load file: HTTP 404"` string. |

---

## C7 · Nits and the documentation defect
**Covers:** all 7 nits.

Mechanical: delete dead `.tool-head:focus-visible`; `dir="auto"` on the compose textarea; skip no-op
todo UPDATE supersessions when nothing changed; remove or wire up dead `useSpawnTerminalAction.ts`
(wiring it up would have given the sweep TerminalOverlay coverage); leave the `document.body`
background and nested-dialog artifacts alone unless they cost something.

### Three comments assert behaviour their file does not have
This is its own defect class, not tidiness:

| File | Fix |
| ---- | --- |
| `popovers/usePopoverExit.ts:6-15` | Rewrite — the "mount site owns every close path" claim is false (C2). **Mine.** |
| `panels/right/terminal/AgentTerminals.tsx:12-14` | Rewrite — "No spawn/close" is false; the `×` ends agents (C1). |
| `panels/fileViewer/shells/ModalShell.tsx:6-9` | Delete — documents a `fileViewerModalDismissed` flag and "Reopen viewer" pill that were never built. |

`tests/token-contrast.test.ts` exists because *"a comment nobody verifies is worse than no comment"* —
nine hand-written ratios were wrong and one hid a real WCAG failure. That lesson was applied to one
file and generalised nowhere. Two of the three above sit on destructive or redesign-critical code.

---

## Sequencing

Ordered by dependency and risk, not severity.

| # | Cluster | Why here |
| - | ------- | -------- |
| 1 | **C1** destructive contract | Highest severity; rebase first so later work lands on top of it. Makes C3a less dangerous. |
| 2 | **C2** popover contract | Self-contained; closes 3 defects I introduced; low blast radius. |
| 3 | **C7** comment corrections | Trivial, and must ship with C1/C2 while the truth is fresh. |
| 4 | **C6** states and feedback | Independent, mostly local, no shared-contract risk. |
| 5 | **C3** focus and keyboard | Shared hooks; do after C1 so the leak-to-Restart-kernel case is already defused. |
| 6 | **C4** responsive shell (option 1) | Touches the dock engine; isolate it so a layout regression is bisectable. |
| 7 | **C5** event semantics | **Last, and alone.** Changes what a stored value MEANS across renderer *and* kernel. |

**C5 must not share a commit with anything else.** Changing the meaning of a stored value is the class
of change where consumers get missed, and this log is append-only — a bad write is permanent.

## Verification gates (every cluster)

1. `pnpm run lint` **as its own gate first** — renderer `test` is `lint && test:static-colors && vitest run`,
   so a lint failure means vitest never runs and no report is written.
2. `npx tsc -b`.
3. Full vitest under **Node 20** (Node 25 shadows jsdom's `localStorage` and reds 32 files).
4. Diff failures **per test name** against `docs/ui-sweep/2026-08-02-test-baseline.json`, never by file
   set — `view-toggle`/`feed-*`/`topBar` are already red, so a file-set diff is blind for them.
5. For each new guard test: **plant the bypass, watch it fail, then remove it.** A guard that has never
   been seen red proves nothing — that is how the reduced-motion guard passed for months while blind.
6. Re-run the affected `ui-sweep` unit against a live kernel for anything with a browser-verified repro
   (BL3, BL4, BL5, H2-H4, H6).

## Open question for Oran

**C4** — clamp the centre pane now (fixes the Blocker, no mobile layout), or build collapse-to-overlay
as its own project? The plan assumes clamp-now.
