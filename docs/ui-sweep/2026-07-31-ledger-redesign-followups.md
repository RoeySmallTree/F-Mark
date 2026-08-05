# Ledger redesign — what this branch did NOT do

`feature/ui-redesign-ledger` covers the **token system and the shell**. These are the
items the work surfaced and deliberately left. Each says why, so the next pass does not
have to rediscover them.

---

## 1. The right rail still offers ten flat choices — **highest priority**

`packages/renderer/src/shell/rightPanel/RightPanelTabs.tsx`,
`packages/renderer/src/state/rightTabsConfig.ts`

The UX review's second Critical, and it is correct: the shell went from 12 panes across
5 tab strips to 10 choices in 1 strip. That is a large improvement in *placement*
determinism, but the number of simultaneous choices is barely reduced.

The recommended fix is grouping into 2–3 labelled clusters — Work (Todos, Comments,
Named) / Code (Files, Diff, Search) / Runtime (Agents, Terminal, Log) — with the rest
behind an overflow. That also fixes the current cost: with labels restored the strip
wraps to **3 rows, 101px** in a 340px column. Labels were restored because the icon-only
alternative was worse (Log and Terminal were near-identical glyphs at 13px), but 101px
of navigation chrome is not the end state.

## 2. `--ink-4` is below AA and used as text in 214 places

`packages/renderer/src/themes/tokens.css`

Measures **2.37:1**. Nominally the disabled/hairline tier, but 214 call sites set it as
`color:` on real text. Left unchanged because ~60 further sites use it as a border
colour, where darkening to AA would visibly thicken the whole chrome.

The fix is to split the two roles: a text tier that clears 4.5:1, and a separate
non-text mark tier. That is a mechanical but broad migration across ~275 call sites.

## 3. The dock is collapsed, not removed

`packages/renderer/src/shell/dockLayout.tsx`, `packages/renderer/src/themes/layout.ts`

Drag-and-drop machinery, the 36-placement guillotine engine, and the drop-target
handlers all still exist behind a pinned default. `ToolbarDockTabs.tsx` and
`CenterDockTabs.tsx` are confirmed **dead code** (zero importers) and can be deleted.
`LeftRail.tsx` was already dead before this branch.

Three strips are suppressed with `display: none` rather than removed, so their
components still mount. `.left-dock-tabs` is at least gated on `data-pane-count="1"` so
an area that gains a second pane gets its switcher back; the other two are
unconditional and should become deletions.

Removing all of this is what would finally shrink `shell.css` (still ~6k lines).

## 4. The right-hand Log duplicates the centre feed

`packages/renderer/src/panels/right/RightLog.tsx` vs `packages/renderer/src/shell/Feed.tsx`

Two chronological lists of the same events, on screen simultaneously, with no stated
difference between them. Either fold Log into a Feed view mode, or relabel it explicitly
as the raw event log as distinct from the curated document.

## 5. Surfaces that adopted the palette but were not redesigned

The token names were kept as the contract, so ~21k lines of component CSS picked up the
Ledger palette for free. They have **not** been reshaped to the direction:

- **Compose** — the secondary row still carries 7 icon buttons in one strip (Agent,
  Presets, Skills, Task, Attach, Fork, Settings). Untouched by the de-crowding pass.
- **The composer avatar reads "You You"** — a visible duplication bug.
- **~110px dead gap** between the turn-end divider and the composer.
- Feed cards, modals, the file viewer, popovers.

## 6. The signature is half-built

`DESIGN.md` describes the entry gutter as carrying a mono sequence number and a
supersession mark tying a superseded entry to its replacement. What shipped is the flat
rule plus the authorship mark. The **sequence number and the supersession tie-line are
not implemented** — they need the event index and the `supersedes` edge plumbed into the
card components.

That tie-line is the design's most subject-specific idea (it renders F-Mark's actual
data model) and is the highest-value remaining visual work.

## 7. Pre-existing test-environment breakage

32 renderer test files are red on this branch's base, independent of any change here.
At least part is Node 22 exposing a native `localStorage` that shadows jsdom's and lacks
the `Storage` prototype methods, so `.clear()` throws. `tests/dock-migration-v5.test.ts`
works around it with an in-memory stub; the environment itself was not fixed.

## 8. Deferred minors

- `LedgerHeader` renders a spacer instead of the pane tablist when only one centre pane
  exists, so header content shifts between sessions. Reserve a fixed slot.
- `packages/renderer/index.html` still loads **23 Google Font families**; only IBM Plex
  Sans and IBM Plex Mono are used now. Trimming that link is a real payload win.
- `themes/fonts.ts` still offers font presets referencing dropped families.
- The Settings → Pane Arrangement editor still shows a "Toolbar" drag-out list, which
  contradicts v5's statement that nothing is stowed.
