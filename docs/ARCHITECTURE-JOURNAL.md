
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
