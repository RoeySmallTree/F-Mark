
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
