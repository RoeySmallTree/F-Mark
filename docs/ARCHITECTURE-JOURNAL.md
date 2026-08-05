
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
