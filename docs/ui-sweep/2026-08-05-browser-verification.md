# Browser verification of the sweep fixes — 2026-08-05

Driven against a real kernel on merged `main`, in a throwaway project root with an isolated `HOME`.
Every result below is a **measurement or an observed dialog**, not a reading of the source.

**`git` works on this machine now.** It was the Xcode shim during the 2026-08-04 sweep, which is why
BL5 was carried unverified for a week and blocked all of unit U9. This is the first run that could
reach those surfaces.

## Results

| #   | Finding                                                            | Verified            | Evidence                                                                                                                                                                                                                                                     |
| --- | ------------------------------------------------------------------ | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| BL1 | Modals promise focus containment and deliver none                  | **fixed**           | 20 Tab presses inside the onboarding dialog, **zero escapes**; observed wrapping `Next → Skip onboarding`. Focus also moves _into_ the dialog on mount. `Restart kernel` — the control focus used to leak onto — is present in this build and never reached. |
| BL2 | Fixed-width panes make the app unusable below ~1024px              | **partially fixed** | See below.                                                                                                                                                                                                                                                   |
| BL3 | `Cmd+Backspace` removes a todo and its subtree unconfirmed         | **fixed**           | Dialog: _"Remove this task? Removed tasks stay in the event log but leave the tree."_ Cancel verified: the task survived.                                                                                                                                    |
| BL4 | Killing a terminal destroys a running shell in one click           | **fixed**           | On a **real spawned tmux shell**: _"Kill terminal fmark-project-846a2084-term-1? The shell and everything running in it end now. This cannot be undone."_ Cancel verified: the terminal survived.                                                            |
| BL5 | `Delete file` destroys an untracked file unrecoverably             | **fixed**           | _"Delete file — brandnew.ts? This file is untracked, so git cannot restore it. This is permanent."_ Cancel verified **on disk** — the file was still there afterwards.                                                                                       |
| M6  | Sessions search input has no visible focus ring                    | **fixed**           | Computed style after a real focus: `outline: solid 2px`. Previously `none 0px`.                                                                                                                                                                              |
| M13 | Icon buttons below touch-target minimum                            | **fixed**           | Visual size 32×32, **hit area 44×44** (`::before { inset: -6px }`), `.topbar-right` gap 12px, adjacent gaps measured at 12px — **no overlap**, so no button swallows its neighbour's clicks.                                                                 |
| M1  | Composite widgets declare a role and implement no keyboard pattern | **fixed**           | Right-panel tablist: 10 tabs, **exactly one** `tabIndex 0` and it is the selected one; `ArrowRight` moved focus `Log → Files tree`, `ArrowLeft` moved it back.                                                                                               |

Also observed in passing: the per-hunk button on an untracked file now reads **"Delete hunk"**. The
sweep recorded it as "Revert hunk" — the same destructive outcome under a far softer label, which it
called the sharpest framing in the report. The label fix is live.

## BL2 — what is and is not fixed

**Fixed: the centre pane no longer collapses.** Measured on the shell grid:

| Viewport | `grid-template-columns` | Centre pane           |
| -------- | ----------------------- | --------------------- |
| 768px    | `204px 360px 204px`     | **360px** (was 140px) |
| 375px    | `8px 360px 8px`         | **360px** (was **0**) |

The floor holds at both widths and the side panes give way instead, which is the Blocker's actual
claim — controls that could not be clicked now can be.

**Not fixed: horizontal overflow at 375px.** `scrollWidth` is 600 against a 375px viewport. The
overflow is **not** the panes — it is the top bar. Measured offenders:

- `.view-toggle` — 320px wide, right edge at 534px
- `.breadcrumb` — right edge at 387px

The three feed-mode buttons (Everything / Document / Conversation) carry full text labels ~100-118px
each and do not collapse. That is a **separate defect from the one BL2 named**, with a separate cause,
and it wants its own fix — icon-only or overflow-menu behaviour for that group below some width.
Recorded here rather than folded into BL2 so it is not lost, and not claimed as fixed.

## Not covered

- **H2-H4** popover exit animations — needs frame-level observation rather than a state check; the
  unit tests around `useDeferredUnmount` cover the contract.
- **H6** file-viewer tab keyboard reachability — `TabItem` gained `tabIndex` and Enter/Space handling
  in this run's roving work, but it was not exercised in the browser here.
- Anything requiring a live paid agent. None was spawned: the terminal test used a plain tmux shell,
  so this whole verification cost nothing.
