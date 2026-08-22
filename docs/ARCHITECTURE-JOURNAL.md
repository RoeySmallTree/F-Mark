
## 2026-07-31 — Ledger: token system + three-zone shell

How it works: F-Mark's UI had no design, it had a configuration space — 17 themes × 3
densities × 12 dockable panes × 5 drop areas × 36 layouts. "Ledger" replaces that with
one opinion grounded in F-Mark's own model (an append-only event log = a ruled ledger
sheet), where every visual channel carries exactly one meaning.

Flow (from the user):
1. The user opens a session → the top bar carries identity only; document controls now
   sit on the document, in a new LedgerHeader
2. → the feed renders as ruled entries, each with a gutter mark whose colour AND shape
   say who wrote it (ink square = person, green circle = agent)
3. → context surfaces live in one right-hand tablist with a deterministic home, instead
   of 12 panes the user had to place across 5 areas
4. → the user ends up reading a document instead of managing a window manager

Why this way:
• Redefined existing token VALUES, kept their NAMES → (not renaming tokens, which would
  have broken 21.8k lines of component CSS and made the change unshippable)
• Collapsed the dock behind a pinned default → (not deleting dockLayout.tsx outright,
  which touches all 12 panes' render paths at once)
• One accent with one meaning → (not a palette per theme, which is what let a runtime
  WARNING render in the agent colour unnoticed)
• Contrast ratios verified by a test that recomputes them from the file → (not comments,
  which is what they were: nine of fourteen were wrong and one hid a live AA failure)

## 2026-07-31 — Destructive Action Contract

How it works: F-Mark had three unrelated confirmation mechanisms and no authority among them, so each
destructive surface picked one or picked none. Confirmation is now a single renderer-side contract:
a hook shows the dialog and returns a branded `ConfirmedIntent` receipt, and `goodbye` requires that
receipt as a parameter — so a call site that skips confirmation fails to compile rather than shipping.

Flow (from the user):
1. The user clicks a destructive control (end an agent, delete a session, revert a file, remove a todo
   or runtime) → the handler calls `useConfirmDestructive` instead of acting
2. → the dialog names the specific loss; for a cascading delete the blast radius comes from the kernel
   that performs the cascade, never re-derived on the client
3. → Cancel returns `null` and the handler bails; Accept returns a receipt that unlocks the mutation

```
  click ──► useConfirmDestructive ──► dialog
                    │                   │
            Accept  │                   │  Cancel
                    ▼                   ▼
            ConfirmedIntent          null ──► return (no mutation)
                    │
                    ▼
            api.goodbye(..., intent)      ← won't compile without it
```

Why this way:
• Confirmation enforced by a type, not a convention → (not a code-review rule, which regrows the bug)
• The kernel nonce renamed to `requestNonce` → (not kept as "confirm token", whose name caused the UI
  to trust a guarantee a server structurally cannot give — that misplaced trust produced Blocker B2)
• Cascade count fetched from the server that cascades → (not passed down as more props, which fixes
  today's instance and leaves the class)
• `fetchDescendants` made required, local fallback deleted → (not left optional, which keeps a second
  source of truth one omitted prop away)
## 2026-08-02 — Aurora foundation

How it works: One CSS file holds three themes' worth of colour values; ~5,751 `var()` call
sites across the app drink from it, so changing values there re-skins everything without
touching a single component. Two test files stand guard over that file so the design rules
are enforced by machine rather than memory.

Flow (from the user):
1. The user loads F-Mark → no theme class on `<body>` → `:root` applies → they see Aurora light
2. → they pick "Night" in settings → `applyTheme` adds `body.theme-night` → the same 5,751
   call sites now resolve to the dark palette
3. → a developer later edits a colour → `token-contrast.test.ts` recomputes every token against
   every surface that theme uses, and `quality-floor.test.ts` re-scans all 29 CSS files → a
   change that breaks AA or the motion floor fails the build instead of shipping

Why this way:
• Aurora's values mapped onto the *existing* Ledger token names → (not the `--tx`/`--ac`/`--solid`
  names DESIGN.md uses, which have zero call sites and would have meant a 5,751-site rename)
• `:root` left as the classless light default → (not dark-by-default, which needed three changes
  to a tested contract plus pre-paint boot CSS)
• Ratios asserted per-surface by a test → (not recorded in comments, which is how nine of
  fourteen numbers went wrong before, one hiding a live AA failure)

Commits: dc6584f · ac0595f · c9c55ce · b351454 · f2961b4 · 29bdee3

## 2026-08-05 — Sweep remediation: guards on actions, not controls

How it works: the 2026-08-04 sweep found 34 defects that were really seven
mechanisms. Each one shipped repeatedly because the guard lived on the
*control* rather than on the *action*, so every new entry point to the same
action arrived unguarded. Each cluster now ends in an enforcement artifact — a
branded type or a test — so the class cannot return silently.

Flow (from the user):
1. The user triggers something destructive — kill a terminal, Cmd+Backspace a
   todo, delete an untracked file, make a project active
2. → the call needs a `ConfirmedIntent`, which only `useConfirmDestructive`
   can mint, so an unconfirmed path fails to compile rather than failing quietly
3. → they get one dialog that names the clicked action and what is lost
4. → recoverable actions deliberately stay unguarded, so the rare dialog keeps
   its meaning

Why this way:
• Branded receipt at the action → (not a confirm at each control — that is
  exactly how six entry points diverged)
• Popover exit derived from the open boolean via `useDeferredUnmount` → (not
  routing every close through a wrap: seven popovers span three state
  mechanisms, so a store-level fix reaches only three and misses Skills)
• Comment removal keeps writing `_removed_` and the kernel learns to read it →
  (not writing a `removed: true` tombstone — the prose validator rejects
  "comments cannot be tombstones", and `applySupersession` already hid the
  comment, so only the marker ever leaked; reading it also fixes every marker
  already on disk)
• Centre pane floored with `min()` in the grid track → (not a dock-engine
  rewrite: the width is a CSS variable with a JS fallback, so collapse-to-
  overlay stays a separate project)
• `useFocusTrap` implemented → (not dropping `aria-modal` to false, which
  would be honest but worse for the people the attribute exists for)

Commits: `be0e3a2..HEAD` — 41 in total, of which 16 are the rebased
destructive-action-contract branch that had been sitting unmerged.

Two counts in the sweep were low, and both were found by writing the guard
rather than by reading: `aria-modal="true"` appears in 13 files, not 9, and
composite widgets missing arrow-key roving number 21, not 5. The roving guard
carries the remaining 15 as an explicit allowlist, so the gap is bounded and
visible instead of open-ended — a new tablist fails the suite.
