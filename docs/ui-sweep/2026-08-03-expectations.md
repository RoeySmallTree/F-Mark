# Phase 2 — Expectations derived from source — 2026-08-03

Branch `feature/ui-redesign-ledger`. Browser-free: every statement here was derived by reading
source **before** the sweep touched the corresponding control.

## Provenance — read this before trusting the coverage

Phase 2 was first delegated to five parallel agents, one per unit group. All five went idle without
delivering output, and two repeated the idle cycle after being nudged. They were stopped and this
document was derived directly instead.

Consequence, stated plainly: this is **narrower** than the five-agent version would have been. It
covers the destructive-control inventory (the safety gate for Phase 3) and the planted verification
questions **thoroughly and with citations**. It does **not** contain a per-control expectation record
for all ~220 controls. Units swept without a written expectation here are marked as such in the
final report rather than being silently counted as covered.

---

## The destructive inventory — this gates what Phase 3 may click

F-Mark is append-only: a revision is a new event carrying `supersedes`, a deletion is a prose
tombstone. Nothing here is undone by "deleting" it. Process-level actions (goodbye, killTerminal)
are genuinely irreversible.

### Guarded — confirmation present

| Control | Source | Gate |
| ------- | ------ | ---- |
| Clear agent (right panel) | `panels/right/agents/RightAgentControls.tsx:126` | `window.confirm("Clear <name>?")` |
| Remove agent (right panel) | `panels/right/agents/RightAgentControls.tsx:163` | `window.confirm("Remove <name>?")` |
| Clear agent (popover) | `panels/right/agents/AgentPopover.tsx:413` | `window.confirm` |
| Say goodbye (popover) | `panels/right/agents/AgentPopover.tsx:426-427` | `window.confirm` then `controller.goodbye` |
| Delete session | `panels/sessions/useSessionDelete.ts:17,53` | `window.confirm` then `client.deleteSession` |
| Remove agent from session | `modals/settings/agents/useAgentsController.ts:109` | `window.confirm` |
| Make active project (`/file-tree`) | `pages/fileTreePage/useProjectPromotion.ts:23` | `window.confirm` — **still present**, answers a planted question |

### Unguarded — destructive with no confirmation step

| # | Control | Source | What actually happens |
| - | ------- | ------ | --------------------- |
| B2 | Agent terminal tab `×` | `panels/right/terminal/useAgentTerminalsController.ts:144-152` | `getConfirmToken()` → `api.goodbye()` → `removeManagedAgent` + `removePresence`. **Terminates the agent.** |
| — | Terminal tab `×` (`killTerminal`) | `panels/right/terminal/useRightTerminalController.ts:145-150` | `apiClient.killTerminal(session)` fires immediately. Destroys a tmux session. |
| B1 | `Revert file` / `Delete file` (diff) | `panels/fileViewer/diff/hunkActionsBar/useHunkActionsBarController.ts:48` | `revertHunkChange` behind only a `busy` flag; `grep -rn "confirm" panels/fileViewer/diff/` returns nothing. **Unauditable this run — no git.** |
| — | Remove runtime (Settings) | `modals/settings/settingsModal/useRuntimeActions.ts:54-57` | `apiClient.removeRuntime(id)` with no gate. Recoverable by re-adding, so lower severity than the three above. |

**The pattern the 2026-07-30 sweep named still holds exactly:** the guarded destructive actions are
guarded well, and the most dangerous ones are not guarded at all. 7 guarded / 4 unguarded.

### Phase 3 rules that follow from this table

- Everything in the unguarded table is **probe-only**. Never click to completion.
- Guarded controls may be exercised **only** against a `ZZ-UISWEEP` fixture created by this sweep,
  and only to verify the confirm dialog appears, reads correctly, and that Cancel actually cancels.
- `Connect` in the agent launcher is probe-only regardless: it launches a real paid agent process
  and triggers hook + MCP installation.

---

## Planted verification questions — answered

### U12(a) · Does the agent terminal `×` destroy the agent? — CONFIRMED, and it contradicts its own comment

`panels/right/terminal/AgentTerminals.tsx:12-14` states:

> "No spawn/close — agents are created and ended through the agent lifecycle, not here."

The controller does exactly what the comment denies. `useAgentTerminalsController.ts:144-152`
resolves a token and calls `api.goodbye(...)`, then tears down presence and managed-agent state.

The sharp part is the naming. The call is `api.getConfirmToken(...)` — which reads like human
confirmation and is not. It is a server-issued nonce, and **a server cannot verify that a human
agreed to anything**. That misplaced trust is the actual defect, and it is why the sibling branch
renamed the concept to `requestNonce`. A `×` shaped and positioned like "close this tab" ends a
live agent with no human in the loop.

### U12(b) · Does `killTerminal` destroy a tmux session unconfirmed? — CONFIRMED

`useRightTerminalController.ts:145-150`. `close(session)` calls `apiClient.killTerminal(session)`
directly. No confirmation on any path. `RegularTerminals.tsx:13` describes the control as
"a `×` to kill one", so the label is at least honest — but the action is immediate and irreversible.

This is B2's twin. It was surfaced by the final review on `feature/destructive-action-contract` and
is unfixed **on both branches**.

### U11 · Does any modal implement a focus trap or focus restore? — CONFIRMED ABSENT

Zero matches across `modals/`, `overlays/`, `popovers/`, `components/` for any of:
`focusTrap`, `focus-trap`, `trapFocus`, `restoreFocus`, `returnFocus`, `previouslyFocused`,
`activeElement`.

Worse than merely missing: at least six modals declare `role="dialog"` **and `aria-modal="true"`**
(`HtmlPreviewModal.tsx:70-71`, `ReconnectModal.tsx:102-103`, `TerminalOverlay.tsx:39-40`,
`SettingsModalView.tsx:19-20`, `NewSessionView.tsx:18-19`, and others). `aria-modal="true"` is a
promise to assistive technology that focus is contained. Declaring containment that is not
implemented is worse than declaring nothing: a screen-reader user is told they are inside a modal
and can then tab straight out into the page behind it.

Severity note: the seven `window.confirm` sites above get focus handling correct for free, because
the browser owns that dialog. It is the app's own modals that do not.

### U3 · Did the four Aurora feed additions land? — all PRESENT

Verified by grep in `packages/renderer/src` earlier in this session:

| Addition | Status |
| -------- | ------ |
| `.is-fresh` new-event edge (`useFreshFeedKeys` / `calculateFreshKeys`) | PRESENT |
| `j`/`k` navigation (`useFeedStepNavigation`) | PRESENT |
| Tool disclosure `grid-template-rows: 0fr → 1fr` | PRESENT |
| Copy-on-click of tool args (`render/copy.ts`) | PRESENT |

### U6 · Do all popover close paths route through `usePopoverExit`? — YES, after repair

`packages/renderer/src/popovers/usePopoverExit.ts` is wrapped at **every mount site**, not inside the
shared `Popover` frame. That placement is load-bearing: three popovers close from their own
controller — `usePresetsPopoverController.ts:142` (select), `forkSessionPopover/actions.ts:69`
(successful fork), `createTodoPopover/submitTodo.ts:68` (successful create) — and those paths never
pass through `Popover`'s backdrop or Escape handlers. A frame-level wrap would have animated Escape
and missed selection entirely.

One genuine bypass was found and closed during implementation: the compose mention picker's
`onSelect` closed the picker inline, sidestepping the wrap. It is now an explicit `closeOnSelect`
prop, because three of that picker's four hosts are multi-select and must stay open.

Verified in-browser (computed styles, not inferred): open → `popover-enter` 0.2s, `pointer-events:
auto`; t+80ms → `is-closing`, `popover-exit` 0.16s, `pointer-events: none`, backdrop `is-closing`
too; t+280ms → unmounted.

---

## Cross-cutting expectations (apply to every unit)

- **Console/network:** zero uncaught errors; no 4xx/5xx swallowed silently.
  Known at rest: `/runtimes/codex/models` and `/runtimes/codex/efforts` both return **502** because
  `codex` is not installed, surfacing as two uncaught console errors on load. Expectation to test
  against: an absent runtime is a normal, expected state and should render as "not installed", not
  as a bad-gateway error. Candidate finding, to be judged in the browser.
- **States:** loading · empty · error · disabled · offline (kill WS) · permission-pending.
  `zz-uisweep-empty` exists specifically to exercise empty states.
- **Forms:** empty submit · invalid · overlong (>10k) · special chars/emoji/RTL · double-submit.
- **Viewports:** 1440 · 768 · 375.
- **A11y:** keyboard reachability, focus visibility, `aria-label` presence — and, given the finding
  above, whether `aria-modal` is claimed without containment on each modal encountered.
