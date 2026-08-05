# Sweep Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close all 34 findings from `docs/ui-sweep/2026-08-04-ui-sweep.md` plus the 6 carried Cluster A items, with an enforcement artifact per defect class so the class cannot silently return.

**Architecture:** Seven clusters, each grouped by *mechanism* rather than by symptom. Each cluster ends in a type or a test that makes the defect non-reintroducible. Landed in dependency order, with the one invariant-changing cluster (C5) shipped last and alone.

**Tech Stack:** pnpm monorepo — `packages/kernel` (Fastify + CLI + MCP), `packages/renderer` (React 18 + Vite + Zustand + Monaco), `packages/shared`. Vitest, TypeScript project references.

---

## What the research changed

This plan supersedes `2026-08-05-sweep-remediation.md`. Reading every call site before planning invalidated six of its assumptions. Each correction is load-bearing.

| # | Earlier assumption | What the code actually says |
| - | ------------------ | --------------------------- |
| 1 | `feature/destructive-action-contract` "protects 1 of 6 destructive actions" | It protects **four**. BL5, M15, session-delete and the agent surfaces are already done there, with tests (`model.test.ts` +178, `RightAgentControls.test.tsx` +127). |
| 2 | B2 needs a `ConfirmedIntent` on the terminal `×` | The branch fixes B2 by **deleting the destructive call** (`cf1efc7 fix(terminal): close the terminal view without ending the agent`). `close()` now only unmounts. A confirm would have been the wrong fix — the `×` should close a tab, not end an agent. |
| 3 | BL5 needs a new `isUnrecoverableRevert(status)` predicate | Redundant. The branch already ships `revertActionLabel` + `revertConfirmDetail`, which are strictly better: they guarantee the dialog names the *clicked action*, and they already encode the "don't over-warn on recoverable paths" rule in `revertConfirmDetail`'s `isDeleted` branch. **Do not add the predicate.** |
| 4 | BL3's fix must drive the inline `TodoConfirmRemove` | The branch **deletes** `TodoConfirmRemove.tsx` and `cards.css` -24, replacing it with `window.confirm` via `useConfirmDestructive`. Post-rebase the confirm is browser-native, which also removes the "verify the confirm UI receives focus" concern — the browser owns that. |
| 5 | C2: "move the delay into the store action" | Covers **3 of 7 popovers**. Only `presets`, `compose-settings` and `log-filter` live in the store; `mentions`, `createTodo`, `fork` and `skills` are local `useState` anchor rects in `useComposePopovers.ts`. A store-level fix cannot see four of them. Replaced with `useDeferredUnmount` — see C2. |
| 6 | C4: "the widths are JS constants, a media query cannot fix this" | **Wrong.** `themes/layout.ts:145` emits `var(--pane-w-<pane>, 288px)` into a grid track. `DEFAULT_WIDTH` is only the CSS fallback. The track is CSS, so a `min()` wrapper fixes the Blocker in one function. C4 drops from "expensive" to one task. |

Two further facts found while tracing, both recorded as constraints below: the kernel validator rejects `removed: true` with non-empty content, and `getProseRole` ranks `mode: "comment"` **above** `removed: true`.

---

## Global Constraints

Every task's requirements implicitly include this section.

- **No TDD.** Implementation first, then the test that pins it. (Oran's CLAUDE.md overrides the skill default.)
- **Typecheck is per package.** There is no root `tsconfig.json`, and `npx tsc` resolves to a decoy `tsc@2.0.4` package on npm rather than the workspace compiler. Use `pnpm -F @f-mark/renderer exec tsc -b` and `pnpm -F f-mark exec tsc --noEmit`.
- **Node 20 for all test runs.** Node 25 ships an inert `globalThis.localStorage` that shadows jsdom's and reds 32 renderer files. Use `nvm use 20` before any vitest command.
- **`pnpm run lint` is its own gate, run first.** The renderer's `test` script is `lint && test:static-colors && vitest run` — a lint failure means vitest never runs and no report is written. A green `pnpm test` after a lint error proves nothing.
- **Regression check by test *name*, not file set.** Diff against `docs/ui-sweep/2026-08-05-node20-baseline.txt` — **not** `2026-08-02-test-baseline.json`, which is a list of 32 *file paths* recorded under Node 25 and is both too coarse (it cannot see a regression inside an already-red file) and wrong for Node 20. Measured Node-20 truth on `be0e3a2`: renderer 17 failing tests in 6 files, kernel 41 failing tests in 10 files. All 6 renderer files are a subset of the old 32.
- **Two vitest roots:** `packages/renderer/src/**` and `packages/renderer/tests/**`. A path matching zero files exits 0 — confirm the covering test actually ran.
- **Every new guard test must be seen red.** Plant the bypass, run, watch it fail, remove the bypass, run again. A guard never seen red proves nothing.
- **The event log is append-only.** A bad write is permanent and can only be masked. Never point a dev kernel at a real project root; pass `--path <scratch>` and redirect `HOME`/`XDG_CONFIG_HOME`.
- **Style:** functional, `const` by default, functions under 30 lines, explicit over clever, no unnecessary comments, no emojis in code or commit messages. Commit messages imperative mood.
- **Branch:** all work lands on `feature/ui-redesign-ledger`. Push to `fork` (oranefroni10/F-Mark) — `origin` (RoeySmallTree) is read-only.
- **`NO_LOOSE_STRING_VALUES`** is this codebase's convention for string literals. Follow it in new code.

---

## File Structure

**New files**

| Path | Responsibility |
| ---- | -------------- |
| `packages/renderer/src/popovers/useDeferredUnmount.ts` | Owns "should this still be mounted, and is it leaving" derived from an `isOpen` boolean. Replaces `usePopoverExit`. |
| `packages/renderer/src/a11y/useFocusTrap.ts` | Contain Tab within a container; restore focus to the trigger on unmount. |
| `packages/renderer/src/a11y/useRovingTabIndex.ts` | Arrow-key roving for `tablist` / `radiogroup` composites. |
| `packages/renderer/src/shell/anchorFlash.ts` | The single transient-flash implementation (extracted from `FeedRows.tsx`). Not a hook, so not `use*`-named. |

**Deleted**

| Path | Why |
| ---- | --- |
| `packages/renderer/src/popovers/usePopoverExit.ts` | Superseded by `useDeferredUnmount`. Its header comment is also factually false (C7). |
| `packages/renderer/src/components/participantStrip/useSpawnTerminalAction.ts` | Dead code, zero call sites. See Task 13 for the decision. |

Everything else is modification in place. The codebase's established pattern is small controller/model/view triples per feature; follow it rather than restructuring.

---

## Sequencing

| # | Task | Cluster | Why here |
| - | ---- | ------- | -------- |
| 1 | Land the in-flight popover work | — | 26 modified files are uncommitted. Land them first so remediation diffs stay separable and bisectable. |
| 2 | Rebase `feature/destructive-action-contract` | C1 | Brings four fixes for free. Everything after builds on it. |
| 3 | BL4 — confirm before killing a terminal | C1 | The one destructive action neither branch covers. |
| 4 | BL3 — the todo keyboard bypass | C1 | Depends on Task 2's `useConfirmDestructive`. |
| 5 | C2 — `useDeferredUnmount` | C2 | Self-contained; closes three defects introduced in Task 1. |
| 6 | C7 — the three false comments | C7 | Trivial, must ship while the truth is fresh. |
| 7-10 | C6 — states and feedback | C6 | Independent, local, no shared-contract risk. |
| 11 | C3a — focus trap | C3 | After Task 3, so the leak-to-a-destructive-control case is already defused. |
| 12 | C3b/c/d — roving, ring, touch targets | C3 | |
| 13 | C7 — mechanical nits | C7 | |
| 14 | C4 — clamp the centre pane | C4 | Touches layout; isolate so a regression is bisectable. |
| 15 | C5 — event semantics | C5 | **Last and alone.** Changes what a stored value means across kernel *and* renderer. |

---

## Task 1: Land the in-flight popover and motion work

The working tree has 26 modified files and 4 untracked from the Aurora motion work and the sweep. Committing first keeps every later diff reviewable.

**Files:**
- Commit: the 26 modified `packages/renderer/**` files
- Commit: `packages/renderer/src/popovers/usePopoverExit.ts` (new)
- Commit: `docs/ui-sweep/*.md`, `docs/superpowers/plans/*.md`

**Interfaces:**
- Produces: a clean tree at a known-good commit, so Task 2's rebase has a single parent.

- [ ] **Step 1: Confirm the working tree contains only intended changes**

```bash
cd /Users/oranefroni/Projects/F-Mark/.claude/worktrees/ui-redesign-ledger
git status --short
```

Expected: 26 ` M` under `packages/renderer/`, plus 4 `??` (three `docs/ui-sweep/*.md`, one `docs/superpowers/plans/*.md`) and `packages/renderer/src/popovers/usePopoverExit.ts`.
There must be **no** `zz-uisweep-*` files. If any appear, delete them — they are sweep debris, not source.

- [ ] **Step 2: Run the gates**

```bash
nvm use 20
pnpm --filter @f-mark/renderer run lint
npx tsc -b
pnpm --filter @f-mark/renderer exec vitest run
```

Expected: lint clean, tsc clean, vitest red only on the known baseline names (`view-toggle`, `feed-*`, `topBar`). Compare against `docs/ui-sweep/2026-08-02-test-baseline.json` **by test name**.

- [ ] **Step 3: Commit the source work**

```bash
git add packages/renderer/src packages/renderer/tests
git commit -m "feat(popovers): animate popover exit at every mount site"
```

- [ ] **Step 4: Commit the sweep artifacts**

```bash
git add docs/ui-sweep docs/superpowers/plans
git commit -m "docs: record the 2026-08-04 UI sweep and its remediation plan"
```

---

## Task 2: Rebase the destructive-action contract onto Aurora

`feature/destructive-action-contract` (`7558f71`, 16 commits) is never pushed and never merged. It already fixes BL5, M15, B2 and session-delete wording. Rebasing is strictly cheaper and safer than reimplementing, and its tests come along.

**Files:**
- Rebase: 68 files across `packages/kernel`, `packages/renderer`, `packages/shared`
- Expect conflicts in: `panels/right/agents/AgentPopover.tsx` (Aurora's popover-exit work touched it), `panels/right/terminal/AgentTerminals.tsx`, `cards/cards.css`

**Interfaces:**
- Produces:
  - `ConfirmedIntent` (branded, `src/confirm/intent.ts`) — an opaque receipt; construct only via `mintConfirmedIntent`.
  - `useConfirmDestructive(): (req: ConfirmRequest) => Promise<ConfirmedIntent | null>` where `ConfirmRequest = { action: string; title: string; detail?: string }`.
  - `revertActionLabel(action: GitRevertAction, status: GitFileStatus): string`
  - `revertConfirmDetail(action: GitRevertAction, status: GitFileStatus): string`
  - `fetchDescendants: () => Promise<string[]>` threaded through `TodoItemProps` (now required).
  - Kernel: `requestNonces.ts` replaces `confirmTokens.ts`; `GET /todos/:id/descendants`.

- [ ] **Step 1: Rebase**

```bash
git checkout feature/destructive-action-contract
git rebase feature/ui-redesign-ledger
```

Resolve conflicts by **keeping both intents**: Aurora owns visual/motion changes, this branch owns the confirmation gates. Where `AgentPopover.tsx` conflicts, the `usePopoverExit`/`closing` wiring from Aurora and the `useConfirmDestructive` call from this branch are orthogonal — both survive.

`cards/cards.css` conflicts because this branch deletes the `TodoConfirmRemove` styles. **Take the deletion.**

- [ ] **Step 2: Verify the rename survived**

```bash
grep -rn "getConfirmToken" packages/ --include="*.ts" --include="*.tsx" | grep -v node_modules
```

**Corrected after execution — "zero hits" was wrong.** The rename in `d924d9e` is **kernel-internal only**: the module, store type and functions became `requestNonces.ts` / `RequestNonceStore` / `mintRequestNonce` / `consumeRequestNonce`, but the HTTP route is still `/managed-agents/:id/confirm-token` and the renderer client method is still `getConfirmToken` (11 hits across `api/managedAgents.ts`, `controlMethods.ts`, `useGoodbyeAction.ts`, `useAgentsController.ts`, `ParticipantStrip.tsx`, `AgentActionMenuPortal.tsx`). Keeping the wire name is a deliberate compatibility choice.

So the correct expectation is: `packages/kernel/src/routes/managedAgents/spawnRoutes/requestNonces.ts` exists and `confirmTokens.ts` does not. Verify with:

```bash
ls packages/kernel/src/routes/managedAgents/spawnRoutes/ | grep -i "nonce\|confirm"
```

**Residual nit, deferred to Task 13:** the misleading name survives at the renderer call sites, which is exactly where the sweep said it misleads. It is no longer load-bearing for safety — after B2's fix the dangerous call site is gone and the rest sit behind `ConfirmedIntent` — so renaming the client method to `getRequestNonce` (leaving the HTTP path alone) is cleanup, not a fix.

- [ ] **Step 3: Verify the four already-fixed findings**

```bash
grep -n "useConfirmDestructive" packages/renderer/src/panels/fileViewer/diff/hunkActionsBar/useHunkActionsBarController.ts
grep -n "useConfirmDestructive" packages/renderer/src/modals/settings/RuntimesPanel.tsx
grep -n "goodbye\|api\." packages/renderer/src/panels/right/terminal/useAgentTerminalsController.ts
```

Expected: hits in the first two (BL5, M15). The third must show **no `api.goodbye`** in `close()` — B2 is fixed by removing the call, not by confirming it.

- [ ] **Step 4: Run the gates**

```bash
nvm use 20
pnpm --filter @f-mark/renderer run lint
npx tsc -b
pnpm --filter @f-mark/renderer exec vitest run
pnpm --filter f-mark exec vitest run
```

Expected: green apart from the recorded baseline names. New passing suites: `confirm/intent.test.ts`, `confirm/useConfirmDestructive.test.tsx`, `RightAgentControls.test.tsx`, `useAgentTerminalsController.test.ts`, `hunkActionsBar/model.test.ts`, `useSessionDelete.test.ts`, `kernel/tests/routes/todoDescendants.test.ts`.

- [ ] **Step 5: Fast-forward Aurora onto the rebased branch**

```bash
git checkout feature/ui-redesign-ledger
git merge --ff-only feature/destructive-action-contract
```

---

## Task 3: BL4 — confirm before killing a terminal

The only destructive action neither branch covers. Verified live during the sweep: one click from a running tmux shell to destroyed, no dialog.

**Files:**
- Modify: `packages/renderer/src/panels/right/terminal/useRightTerminalController.ts:145-167`
- Test: `packages/renderer/tests/panels/rightTerminal.test.ts` (create if absent)

**Interfaces:**
- Consumes: `useConfirmDestructive` from Task 2.
- Produces: `close(session: string): void` unchanged in signature — the confirmation happens inside, so the single call site at `RegularTerminals.tsx:68` needs no change.

- [ ] **Step 1: Gate the kill behind a confirmation**

In `useRightTerminalController.ts`, add the hook and make `close` async-guarded:

```ts
import { useConfirmDestructive } from "../../../confirm/index.js";

// inside the controller, alongside the other hooks:
const confirmDestructive = useConfirmDestructive();

const close = useCallback(
  (session: string): void => {
    void (async () => {
      const intent = await confirmDestructive({
        action: "terminal.kill",
        title: `Kill terminal ${session}?`,
        detail:
          "The shell and everything running in it end now. This cannot be undone.",
      });
      if (intent === null) return;
      setError(null);
      try {
        await apiClient.killTerminal(session);
        removeManagedTerminal(session);
        clearActiveTerminal(activePathId, session);
        setMounted((prev) => {
          if (!prev.has(session)) return prev;
          const next = new Set(prev);
          next.delete(session);
          return next;
        });
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : String(err));
        console.error("kill terminal failed", err);
      }
    })();
  },
  [
    activePathId,
    apiClient,
    confirmDestructive,
    removeManagedTerminal,
  ],
);
```

- [ ] **Step 2: Fix the label/glyph mismatch**

The accessible name is honest ("Kill terminal X") but the visible affordance is a small `×` beside a tab, which a sighted user reads as an ordinary tab-close. The two audiences are told different things.

In `packages/renderer/src/panels/right/terminal/RegularTerminals.tsx:64-68`, give the control the same destructive styling the app already uses for destructive icon buttons, so the glyph carries the warning the label does:

```tsx
<button
  className="terminal-tab-close is-destructive"
  aria-label={`Kill terminal ${t.label}`}
  title={`Kill terminal ${t.label}`}
  onClick={() => c.close(t.tmux_session)}
>
```

Add to `packages/renderer/src/shell/shell.css` next to the existing `.terminal-tab-close` rule:

```css
.terminal-tab-close.is-destructive:hover {
  color: var(--alarm);
}
```

Use `--alarm` and nothing else — the sweep verified "one meaning per channel" holds, and `--alarm` is the destructive channel.

- [ ] **Step 3: Write the test**

Create `packages/renderer/tests/panels/rightTerminal.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useRightTerminalController } from "../../src/panels/right/terminal/useRightTerminalController.js";

describe("right terminal controller", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("does not kill the terminal when the confirmation is declined", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const killTerminal = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useRightTerminalController());
    // Replace the client's killTerminal via the module mock configured in
    // tests/panels/rightTerminal.harness.ts — see the harness pattern used by
    // tests/panels/hunk-actions-bar.test.tsx.
    await act(async () => {
      result.current.close("zz-session");
    });
    expect(killTerminal).not.toHaveBeenCalled();
  });

  it("kills the terminal once the confirmation is accepted", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const killTerminal = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useRightTerminalController());
    await act(async () => {
      result.current.close("zz-session");
    });
    expect(killTerminal).toHaveBeenCalledWith("zz-session");
  });
});
```

Follow the client-mocking harness already used by `tests/panels/hunk-actions-bar.test.tsx` — that file mocks `createClient` at module scope, which is the established pattern here. Do not invent a second mocking approach.

- [ ] **Step 4: Run and verify**

```bash
nvm use 20
pnpm --filter @f-mark/renderer exec vitest run tests/panels/rightTerminal.test.ts
```

Expected: PASS, 2 tests.

- [ ] **Step 5: See the guard red**

Temporarily comment out the `if (intent === null) return;` line. Re-run. Expected: the declined-confirmation test FAILS. Restore the line, re-run, expect PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/renderer/src/panels/right/terminal packages/renderer/src/shell/shell.css packages/renderer/tests/panels/rightTerminal.test.ts
git commit -m "fix(terminal): confirm before killing a running terminal"
```

---

## Task 4: BL3 — close the todo keyboard bypass

`Cmd/Ctrl+Backspace` in a todo input calls the raw `onRemove` prop and destroys a parent plus its whole subtree with no gate, while the X button on the same todo correctly confirms.

**Files:**
- Modify: `packages/renderer/src/cards/todoItem/useTodoItemController.ts`
- Modify: `packages/renderer/src/cards/todoItem/types.ts` (`TodoItemController.remove` signature)
- Test: `packages/renderer/tests/cards/todo/mutationCases.tsx`

**Interfaces:**
- Consumes: `useConfirmDestructive`, `countDescendants`, `removeConfirmTitle` from Task 2.
- Produces: `remove(field?: TodoInputField): Promise<void>` — the optional `field` is additive, so the existing X-button call `remove()` is unchanged.

**Why this is not a one-line swap.** The two paths have genuinely different signatures. `remove()` calls `onRemove(undefined, inputs.values())`; the keyboard path calls `onRemove(field, values)` and the `field` is needed for focus management after removal. That difference is exactly why `useTodoItemInputs` was wired to the raw prop, and why the bug exists. The fix must preserve `field`.

- [ ] **Step 1: Make `remove` carry the field, and pass it to the inputs hook**

In `useTodoItemController.ts`, change `remove` and rewire `useTodoItemInputs`:

```ts
async function remove(field?: TodoInputField): Promise<void> {
  if (draft) {
    await onRemove(field, inputs.values());
    return;
  }
  const descendantCount = await countDescendants(fetchDescendants);
  const intent = await confirmDestructive({
    action: "todo.remove",
    title: removeConfirmTitle(descendantCount),
    detail: "Removed tasks stay in the event log but leave the tree.",
  });
  if (intent === null) return;
  await onRemove(field, inputs.values());
}
```

`useTodoItemInputs` is called **before** `remove` is defined, so pass a stable forwarding closure rather than `remove` itself:

```ts
const removeRef = useRef<(field?: TodoInputField) => Promise<void>>();
const inputs = useTodoItemInputs({
  node,
  draft,
  autoFocusTitle,
  registerInputs,
  onUpdate,
  onIndent,
  onOutdent,
  onFocusPrev,
  onFocusNext,
  onCommitAndCreateBelow,
  onRemove: async (field) => removeRef.current?.(field),
  onToggleDone,
});
removeRef.current = remove;
```

The ref indirection exists because `remove` closes over `inputs`, and `inputs` is produced by the hook we are passing into. Do not try to reorder — `useTodoItemInputs` owns the values `remove` reads.

- [ ] **Step 2: Update the controller type**

In `types.ts`, change the `TodoItemController` member:

```ts
  remove: (field?: TodoInputField) => Promise<void>;
```

- [ ] **Step 3: Add the test**

Append to `packages/renderer/tests/cards/todo/mutationCases.tsx`, following the harness already in that directory:

```tsx
it("confirms before Cmd+Backspace removes a todo with children", async () => {
  const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
  const onRemove = vi.fn();
  renderTodoItem({ onRemove, fetchDescendants: async () => ["child-1"] });

  const title = screen.getByRole("textbox", { name: /title/i });
  fireEvent.keyDown(title, { key: "Backspace", metaKey: true });
  await waitFor(() => expect(confirmSpy).toHaveBeenCalled());

  expect(confirmSpy.mock.calls[0]?.[0]).toContain("1 subtask");
  expect(onRemove).not.toHaveBeenCalled();
});

it("removes via Cmd+Backspace once confirmed, preserving the field", async () => {
  vi.spyOn(window, "confirm").mockReturnValue(true);
  const onRemove = vi.fn();
  renderTodoItem({ onRemove, fetchDescendants: async () => ["child-1"] });

  const title = screen.getByRole("textbox", { name: /title/i });
  fireEvent.keyDown(title, { key: "Backspace", metaKey: true });

  await waitFor(() => expect(onRemove).toHaveBeenCalled());
  expect(onRemove.mock.calls[0]?.[0]).toBe("title");
});
```

The second assertion is the one that matters most: it pins the `field` regression that a naive fix introduces.

- [ ] **Step 4: Run**

```bash
nvm use 20
pnpm --filter @f-mark/renderer exec vitest run tests/cards/todo
```

Expected: PASS including the two new cases.

- [ ] **Step 5: See it red**

Revert `onRemove: async (field) => removeRef.current?.(field)` back to `onRemove` and re-run. Expected: both new tests FAIL. Restore and re-run.

- [ ] **Step 6: Commit**

```bash
git add packages/renderer/src/cards/todoItem packages/renderer/tests/cards/todo
git commit -m "fix(todos): confirm cascade removal on the keyboard path too"
```

---

## Task 5: C2 — replace `usePopoverExit` with `useDeferredUnmount`

**Covers:** H2, H3, H4, M8.

The current design wraps at the **mount site** and requires every closer to route through the wrap. Three bypasses prove that seam is wrong, and the research shows why it can never be right: there are **seven popovers across three different state mechanisms**.

| Popover | State owner | Close call |
| ------- | ----------- | ---------- |
| presets | store `activePopover` | `closePopover()` |
| compose-settings | store `activePopover` | `closePopover()` |
| log-filter | store `activePopover` | `closePopover()` |
| mentions | local `mentionAnchorRect` | `setMentionAnchorRect(null)` |
| createTodo | local `createTodoAnchorRect` | `setCreateTodoAnchorRect(null)` |
| fork | local `forkAnchorRect` | `setForkAnchorRect(null)` |
| skills | local `skillsAnchorRect` | `setSkillsAnchorRect(null)` |

Moving the delay into the store action would cover three of seven and leave skills — the H2 bypass — untouched.

**The fix inverts the direction.** Instead of intercepting every *call* that closes a popover, observe the *state* that says whether it is open. `useDeferredUnmount(isOpen)` returns `{ mounted, closing }`: `mounted` stays true for the exit duration after `isOpen` goes false. Any close path — raw setter, store setter, orchestrator, toggle — flips the source boolean, and the animation follows from the transition. **There is no close path left to bypass, because nothing has to be routed through anything.**

This also means `activePopover.key` clears immediately, so the toggle-reads at `useComposePopovers.ts:84` and `useRightLogController.ts:56` keep working unchanged — the reader audit the earlier plan called for is no longer needed.

**Files:**
- Create: `packages/renderer/src/popovers/useDeferredUnmount.ts`
- Delete: `packages/renderer/src/popovers/usePopoverExit.ts`
- Modify: `packages/renderer/src/compose/ComposePopovers.tsx` (mount gates for mentions/createTodo/fork/skills/presets/composeSettings)
- Modify: `packages/renderer/src/popovers/PopoverRoot.tsx`
- Modify: `packages/renderer/src/panels/right/log/RightLogView.tsx`
- Modify: `packages/renderer/src/components/AgentMentionPicker.tsx` (M8)
- Revert to unwrapped: the 8 mount sites wired in Task 1
- Test: `packages/renderer/tests/popovers/deferred-unmount.test.tsx` (create)

**Interfaces:**
- Produces:

```ts
export function useDeferredUnmount(isOpen: boolean): {
  mounted: boolean;
  closing: boolean;
};
```

- [ ] **Step 1: Write the hook**

Create `packages/renderer/src/popovers/useDeferredUnmount.ts`:

```ts
import { useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "../shell/agentWorkingStrip/timing.js";

const EXIT_MS = 160;

/* Keeps a popover mounted for the length of its exit animation after its
   `isOpen` source turns false. Derived from state rather than from a close
   callback, so no close path can bypass it — openers, orchestrators and
   toggles all flip the same boolean. */
export function useDeferredUnmount(isOpen: boolean): {
  mounted: boolean;
  closing: boolean;
} {
  const [mounted, setMounted] = useState(isOpen);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isOpen) {
      if (timer.current !== null) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      setMounted(true);
      return;
    }
    if (!mounted) return;
    if (prefersReducedMotion()) {
      setMounted(false);
      return;
    }
    timer.current = setTimeout(() => {
      timer.current = null;
      setMounted(false);
    }, EXIT_MS);
  }, [isOpen, mounted]);

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  return { mounted, closing: mounted && !isOpen };
}
```

- [ ] **Step 2: Convert the mount gates**

Every popover render site currently reads `X !== null ? <Popover …/> : null`. Convert each to derive from the hook. `ComposePopovers.tsx:74` becomes:

```tsx
const presets = useDeferredUnmount(
  activePopover.key === NO_LOOSE_STRING_VALUES.presets,
);
// …
{presets.mounted ? (
  <PresetsPopover
    anchorRect={activePopover.anchorRect}
    closing={presets.closing}
    onClose={onClosePopover}
    /* …existing props… */
  />
) : null}
```

Apply the identical shape to: `composeSettings` (`ComposePopovers.tsx:92`), `mentions`, `createTodo`, `fork`, `skills` in the same file; `presets` in `PopoverRoot.tsx:27`; and the log filter in `RightLogView.tsx:76`.

**`anchorRect` must survive the exit.** For the store-backed popovers `activePopover.anchorRect` nulls at the same moment as the key, which would collapse the popover to the top-left corner mid-animation. Hold the last non-null rect:

```tsx
const lastRect = useRef<DOMRect | null>(null);
if (activePopover.anchorRect !== null) lastRect.current = activePopover.anchorRect;
// pass lastRect.current while presets.closing is true
```

The four local-state popovers do not need this — their rect *is* the open flag, so read `mounted` from the rect and keep the rect in a ref the same way.

- [ ] **Step 3: Revert the Task 1 mount-site wraps**

Remove the `usePopoverExit` import and the `requestClose` indirection from the 8 sites wired in Task 1: `ComposeSettingsPopover.tsx`, `LogFilterPopover.tsx`, `SkillsPopover.tsx`, `AgentPopover.tsx`, `AgentChipEditorPopover.tsx`, `PresetsPopover.tsx`, `ForkSessionPopover.tsx`, `CreateTodoPopover.tsx`. Their `onClose` props go back to calling the close directly. `closing` now arrives as a prop from the parent.

Then delete `packages/renderer/src/popovers/usePopoverExit.ts`.

- [ ] **Step 4: Put the mention picker on the shared frame (M8)**

`AgentMentionPicker.tsx` renders a plain `div`, so it has no backdrop and no Escape handler — its X button is the only exit. Replace its wrapper with the shared `Popover`, which already declares `aria-modal="false"` honestly and owns both behaviours. Keep the `closeOnSelect` prop added in Task 1: three of the picker's four hosts are multi-select and must stay open on select.

- [ ] **Step 5: Write the enforcement test**

Create `packages/renderer/tests/popovers/deferred-unmount.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDeferredUnmount } from "../../src/popovers/useDeferredUnmount.js";

describe("useDeferredUnmount", () => {
  it("stays mounted and reports closing for the exit duration", async () => {
    const { result, rerender } = renderHook(
      ({ open }) => useDeferredUnmount(open),
      { initialProps: { open: true } },
    );
    expect(result.current.mounted).toBe(true);
    expect(result.current.closing).toBe(false);

    rerender({ open: false });
    expect(result.current.mounted).toBe(true);
    expect(result.current.closing).toBe(true);

    await act(async () => {
      await new Promise((r) => setTimeout(r, 200));
    });
    expect(result.current.mounted).toBe(false);
  });

  it("re-opening mid-exit cancels the unmount", async () => {
    const { result, rerender } = renderHook(
      ({ open }) => useDeferredUnmount(open),
      { initialProps: { open: true } },
    );
    rerender({ open: false });
    rerender({ open: true });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 200));
    });
    expect(result.current.mounted).toBe(true);
    expect(result.current.closing).toBe(false);
  });
});
```

Then add the structural guard that pins the class — a test asserting no popover mount site gates directly on a raw open-flag. Append to `packages/renderer/tests/quality-floor.test.ts`:

```ts
it("every popover mount site routes through useDeferredUnmount", () => {
  const sites = [
    "src/compose/ComposePopovers.tsx",
    "src/popovers/PopoverRoot.tsx",
    "src/panels/right/log/RightLogView.tsx",
  ];
  for (const site of sites) {
    const source = readFileSync(resolve(ROOT, site), "utf8");
    const popoverRenders = source.match(/<\w*Popover[\s>]/g) ?? [];
    if (popoverRenders.length === 0) continue;
    expect(
      source.includes("useDeferredUnmount"),
      `${site} renders a popover without useDeferredUnmount`,
    ).toBe(true);
  }
});
```

- [ ] **Step 6: Run, and see the guard red**

```bash
nvm use 20
pnpm --filter @f-mark/renderer exec vitest run tests/popovers tests/quality-floor.test.ts tests/compose.test.tsx
```

Expected: PASS. Then delete the `useDeferredUnmount` import from `PopoverRoot.tsx`, re-run, and expect the quality-floor guard to FAIL. Restore it.

The 9 assertions adapted to `waitFor` during the sweep stay valid — the exit delay is unchanged at 160ms.

- [ ] **Step 7: Commit**

```bash
git add packages/renderer/src/popovers packages/renderer/src/compose packages/renderer/src/components/AgentMentionPicker.tsx packages/renderer/src/panels/right/log packages/renderer/tests
git commit -m "fix(popovers): derive exit animation from open state, not close calls"
```

---

## Task 6: C7 — correct the three false header comments

Three separate sweep units independently tripped over a header comment asserting behaviour its file does not have. This is its own defect class: `tests/token-contrast.test.ts` exists precisely because *"a comment nobody verifies is worse than no comment"* — nine hand-written ratios were wrong and one hid a real WCAG failure. Two of these three sit directly on destructive or redesign-critical code.

**Files:**
- Modify: `packages/renderer/src/panels/right/terminal/AgentTerminals.tsx:12-14`
- Modify: `packages/renderer/src/panels/fileViewer/shells/ModalShell.tsx:6-9`
- (`usePopoverExit.ts` was deleted in Task 5, which retires the third.)

- [ ] **Step 1: `AgentTerminals.tsx`**

After Task 2 the comment's claim is finally **true** — `close()` no longer ends the agent. Make it say what is now enforced rather than merely asserted:

```tsx
/* Agent terminals are the live tmux sessions of the project's managed agents
   (each agent's own CLI pane). Derived from the store — they rehydrate on load
   exactly like the agents list, so this view persists across reloads too.
   `close` detaches the view only: ending an agent goes through the agent
   lifecycle, which requires a ConfirmedIntent. See useAgentTerminalsController. */
```

- [ ] **Step 2: `ModalShell.tsx`**

The comment documents a `fileViewerModalDismissed` flag and a floating "Reopen viewer" pill. Confirm neither exists, then delete the paragraph:

```bash
grep -rn "fileViewerModalDismissed\|Reopen viewer" packages/renderer/src | grep -v ModalShell.tsx
```

Expected: zero hits. Delete lines 6-9; do not replace them with a different claim.

- [ ] **Step 3: Commit**

```bash
git add packages/renderer/src/panels
git commit -m "docs: correct two header comments that described absent behaviour"
```

---

## Task 7: C6 — empty and filtered states (H1, M11)

**Files:**
- Modify: `packages/renderer/src/shell/FeedEmptyState.tsx:39-54`
- Modify: `packages/renderer/src/panels/Todos.tsx` (or the todo list view that owns the filter)
- Test: `packages/renderer/tests/shell/feedEmptyState.test.tsx`

- [ ] **Step 1: H1 — give `everything` mode an empty vignette**

The `loading` flag **is** already respected at line 20. The defect is that the catch-all return reuses `FeedLoadingState`, so the default view shows a permanent spinner instead of an empty state. Do not touch the loading check.

Replace the catch-all with a real vignette matching the `document` and `conversation` branches' shape:

```tsx
return (
  <FeedVignette
    title="Nothing here yet"
    body="Messages, tool calls and documents will appear as work happens."
  />
);
```

- [ ] **Step 2: M11 — distinguish "filtered to zero" from "empty"**

Filtering all todos out currently leaves a blank area above "Add task", indistinguishable from genuinely empty. Branch on whether a filter is active:

```tsx
if (todos.length === 0 && hasActiveFilter) {
  return <TodoEmptyState body="No todos match this filter." />;
}
```

- [ ] **Step 3: Test**

```tsx
it("renders an empty vignette in everything mode, not a spinner", () => {
  render(<FeedEmptyState mode="everything" loading={false} />);
  expect(screen.getByText(/nothing here yet/i)).toBeInTheDocument();
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});

it("still renders the loading state while loading", () => {
  render(<FeedEmptyState mode="everything" loading />);
  expect(screen.getByRole("status")).toBeInTheDocument();
});
```

The second test is the guard against "fixing" the loading flag by mistake.

- [ ] **Step 4: Run and commit**

```bash
nvm use 20
pnpm --filter @f-mark/renderer exec vitest run tests/shell/feedEmptyState.test.tsx
git add packages/renderer/src/shell/FeedEmptyState.tsx packages/renderer/src/panels packages/renderer/tests/shell
git commit -m "fix(feed): give the default view an empty state instead of a spinner"
```

---

## Task 8: C6 — H5, unsaved edits on tab close

`state/fileViewerTabs.ts:48-71` `close()` filters the tab out of the array with zero dirty-state awareness. The damning part is that dirty state exists *and is shown to the user*: `FileEditBar.tsx:48` renders "Unsaved changes" when `dirty && !autosave`. The app knows, says so on screen, and closes anyway. Autosave is a user-toggleable checkbox, so this is not a contrived state.

**Files:**
- Modify: `packages/renderer/src/state/fileViewerTabs.ts:48-71`
- Modify: the tab-close call site in `packages/renderer/src/panels/fileViewer/TabItem.tsx`
- Test: `packages/renderer/tests/state/fileViewerTabs.test.ts`

- [ ] **Step 1: Locate the owner of `dirty`**

```bash
grep -rn "dirty" packages/renderer/src/panels/fileViewer packages/renderer/src/state | grep -v node_modules
```

Record which store slice or hook owns it. `close()` cannot consult state it has no reference to; if `dirty` lives in a component rather than the store, the guard belongs at the call site in `TabItem.tsx` instead, and `close()` stays pure. **Pick whichever of the two the trace supports — do not thread a new global.**

- [ ] **Step 2: Gate the close**

Using `useConfirmDestructive` from Task 2, at whichever layer step 1 identified:

```ts
const intent = await confirmDestructive({
  action: "fileViewer.closeDirty",
  title: `Close ${fileName} without saving?`,
  detail: "Your unsaved edits to this file are discarded.",
});
if (intent === null) return;
```

Only prompt when `dirty && !autosave`. A clean tab must close in one click as it does today — over-warning is how the warning that matters gets clicked through.

- [ ] **Step 3: Test**

```ts
it("closes a clean tab without prompting", async () => {
  const confirmSpy = vi.spyOn(window, "confirm");
  await closeTab({ absPath: "/a.ts", dirty: false, autosave: false });
  expect(confirmSpy).not.toHaveBeenCalled();
  expect(tabs()).not.toContain("/a.ts");
});

it("keeps a dirty tab open when the discard is declined", async () => {
  vi.spyOn(window, "confirm").mockReturnValue(false);
  await closeTab({ absPath: "/a.ts", dirty: true, autosave: false });
  expect(tabs()).toContain("/a.ts");
});

it("does not prompt when autosave is on", async () => {
  const confirmSpy = vi.spyOn(window, "confirm");
  await closeTab({ absPath: "/a.ts", dirty: true, autosave: true });
  expect(confirmSpy).not.toHaveBeenCalled();
});
```

- [ ] **Step 4: Run and commit**

```bash
nvm use 20
pnpm --filter @f-mark/renderer exec vitest run tests/state/fileViewerTabs.test.ts
git add packages/renderer/src/state/fileViewerTabs.ts packages/renderer/src/panels/fileViewer packages/renderer/tests/state
git commit -m "fix(file-viewer): confirm before closing a tab with unsaved edits"
```

---

## Task 9: C6 — error clearing, timestamps, and flash (M5, M7, M9)

**Files:**
- Modify: `packages/renderer/src/panels/sessions/useSessionRename.ts`, `useSessionDelete.ts`
- Modify: `packages/renderer/src/cards/AccessRequestCard.tsx:99`
- Create: `packages/renderer/src/shell/anchorFlash.ts`
- Modify: `packages/renderer/src/shell/FeedRows.tsx:41-50`, `packages/renderer/src/panels/prosePanelUtils.ts:23-28`

- [ ] **Step 1: M5 — clear the error on success**

`useSessionRename` and `useSessionDelete` call `setError` only in `catch`, never `setError(null)` on success; only `useSessionSelection.ts:80` clears it. Reproduced three times during the sweep: a validation error persisted through a successful rename and two successful forks.

Add `setError(null)` on the success path of both hooks. Put it immediately before the mutation, not after — an error from a *previous* attempt should clear the moment a new attempt starts.

- [ ] **Step 2: M7 — keep the timestamp on denied approvals**

`AccessRequestCard.tsx:99` reads `if (status !== "approved") return status;`, returning before `time` is computed. The comment at :83-93 says only *scope* is deliberately omitted — the timestamp loss is unintended. Preserve the deliberate scope omission:

```ts
if (status !== "approved") return [status, time].join(" · ");
```

Move the `time` computation above this line. Do not add scope to the non-approved branch — the comment explains why "denied once" genuinely misreads.

- [ ] **Step 3: M9 — one flash implementation, two call sites**

`prosePanelUtils.ts:23-28` `jumpToEvent` does `scrollIntoView` only, while `FeedRows.tsx` `jumpToAnchor` adds `ANCHOR_FLASH_CLASS` for 1200ms. Two jump implementations, one with feedback and one without.

Extract to `packages/renderer/src/shell/anchorFlash.ts`:

```ts
const ANCHOR_FLASH_CLASS = "feed-anchor-flash";
const FLASH_MS = 1200;

/** Scroll an element into view and flash it, so a jump the user requested is
    visibly acknowledged at the destination. */
export function flashAnchor(el: HTMLElement): void {
  el.scrollIntoView({ block: "center", behavior: "smooth" });
  el.classList.add(ANCHOR_FLASH_CLASS);
  setTimeout(() => el.classList.remove(ANCHOR_FLASH_CLASS), FLASH_MS);
}
```

Call it from both sites. This also addresses the recorded "three duplicated transient-flash implementations" — grep for `setTimeout` + `classList.remove` and fold any third into this helper.

- [ ] **Step 4: Test**

```ts
it("clears a stale error once a rename succeeds", async () => {
  const { result } = renderHook(() => useSessionRename());
  await act(async () => { await result.current.rename("s1", ""); });
  expect(result.current.error).not.toBeNull();
  await act(async () => { await result.current.rename("s1", "ok"); });
  expect(result.current.error).toBeNull();
});

it("keeps the timestamp on a denied approval", () => {
  render(<AccessRequestCard status="denied" decidedAt={ISO} />);
  expect(screen.getByText(/denied · /i)).toBeInTheDocument();
});
```

- [ ] **Step 5: Run and commit**

```bash
nvm use 20
pnpm --filter @f-mark/renderer exec vitest run tests/panels/sessions tests/cards
git add packages/renderer/src/panels packages/renderer/src/cards packages/renderer/src/shell packages/renderer/tests
git commit -m "fix(sessions,cards): clear stale errors, keep denial timestamps, unify anchor flash"
```

---

## Task 10: C6 — form feedback, draft race, Monaco disposal, silent drops (M10, M12, M16, M4)

**Files:**
- Modify: the named-mode compose Send control and name field (`packages/renderer/src/compose/`)
- Modify: `packages/renderer/src/panels/todos/useAutoFirstDraft.ts`
- Modify: `packages/renderer/src/panels/fileViewer/` diff renderer
- Modify: `packages/kernel/src/hooks/autoStream/accessRequests.ts:84-86`

- [ ] **Step 1: M10 — explain the disabled Send**

Named-mode Send is disabled on an empty name with no `title`, no `aria-invalid`, no `aria-describedby`: a dead button and no way to learn why. Add all three:

```tsx
<input
  aria-invalid={name.trim().length === 0}
  aria-describedby="compose-name-hint"
/>
<span id="compose-name-hint" className="field-hint">
  Named messages need a name.
</span>
<button disabled={name.trim().length === 0} title="Named messages need a name.">
```

- [ ] **Step 2: M12 — close the draft race**

`useAutoFirstDraft` calls `setDraft(null)` before the async `loadTodos()` reload lands, so the effect's stale snapshot re-triggers and reopens a stray empty draft. Reproduced twice via Enter-triggered blur; not via mouse-click blur.

Gate the effect on the in-flight reload rather than on the todo count alone:

```ts
const reloading = useRef(false);
// set true before loadTodos(), false in its finally
useEffect(() => {
  if (reloading.current) return;
  if (todos.length > 0 || draft !== null) return;
  setDraft(emptyDraft());
}, [todos, draft]);
```

- [ ] **Step 3: M16 — dispose the model, design the deleted state**

`Uncaught Error: TextModel got disposed before DiffEditorWidget model got reset` fired **4 of 4 times** across every revert action. Not fatal, but it is an unhandled exception on the most common diff-tree action.

Dispose the diff model *before* the revert mutation runs, not in the unmount path:

```ts
diffEditorRef.current?.setModel(null);
```

Then, for a file the revert deleted, render a designed state instead of the raw `"failed to load file: HTTP 404"` string the tab currently shows:

```tsx
if (loadError?.status === 404) {
  return <FileGoneState relPath={relPath} />;
}
```

- [ ] **Step 4: M4 — warn instead of silently dropping malformed suggestions**

`kernel/hooks/autoStream/accessRequests.ts:84-86` passes `permission_suggestions` through with only an `Array.isArray` check, and the schema accepts `items: {}`. The renderer then filters strictly on `{id, decision}` and silently renders no scope selector and sends no `option_id` — **with no warning anywhere**.

*Caveat carried from the sweep: the observed mismatch was partly caused by the sweep's own malformed fixture. The silent-failure path is certain; production impact is unverified.* That is exactly why this is a logging fix, not a behaviour change — make the failure visible so the next occurrence is diagnosable.

```ts
const valid = suggestions.filter(isPermissionSuggestion);
if (valid.length !== suggestions.length) {
  request.log.warn(
    { received: suggestions.length, accepted: valid.length },
    "dropped malformed permission_suggestions",
  );
}
```

Add `isPermissionSuggestion` next to the existing validators in that module, checking `id` and `decision` are non-empty strings — the same shape the renderer already requires. Do not change what the renderer accepts; align the kernel to it and log the gap.

- [ ] **Step 5: Run and commit**

```bash
nvm use 20
pnpm --filter @f-mark/renderer run lint
pnpm --filter @f-mark/renderer exec vitest run
pnpm --filter f-mark exec vitest run
git add packages/renderer/src packages/renderer/tests packages/kernel/src
git commit -m "fix(compose,todos,diff,hooks): explain disabled send, fix draft race, dispose diff model, log dropped suggestions"
```

---

## Task 11: C3a — focus trap and focus restore (BL1)

All 9 modals declare `aria-modal="true"` and none contains focus. Seven were Tab-probed live; focus escaped every one, landing somewhere different each time. `aria-modal="true"` is a promise to assistive technology that focus is contained — declaring containment that is not implemented is worse than declaring nothing, because a screen-reader user is told they are inside a modal and can then tab straight out.

The worst instance is the Preset editor leaking focus to "Restart kernel". After Task 3 that control is confirmed, so this is already less dangerous than it was during the sweep — but it is still a promise the app breaks.

By contrast `popovers/Popover.tsx:151-152` correctly declares `aria-modal="false"`. Popovers are honest; modals are not. Implement the trap rather than downgrading the attribute — these are real modals, and honesty by removal would be worse for users.

**Files:**
- Create: `packages/renderer/src/a11y/useFocusTrap.ts`
- Modify: 9 modal components under `packages/renderer/src/modals/` and `overlays/`
- Test: `packages/renderer/tests/a11y/focusTrap.test.tsx`

**Interfaces:**
- Produces: `useFocusTrap(ref: RefObject<HTMLElement>, active: boolean): void`

- [ ] **Step 1: Write the hook**

```ts
import { useEffect, type RefObject } from "react";

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** Contain Tab within `ref` while `active`, and return focus to whatever was
    focused when the trap engaged. Required by every element that declares
    aria-modal="true" — the attribute is a promise this hook keeps. */
export function useFocusTrap(
  ref: RefObject<HTMLElement>,
  active: boolean,
): void {
  useEffect(() => {
    if (!active) return;
    const container = ref.current;
    if (container === null) return;
    const previous = document.activeElement as HTMLElement | null;

    const items = (): HTMLElement[] =>
      Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null,
      );

    items()[0]?.focus();

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key !== "Tab") return;
      const focusable = items();
      if (focusable.length === 0) return;
      const first = focusable[0] as HTMLElement;
      const last = focusable[focusable.length - 1] as HTMLElement;
      const current = document.activeElement;
      if (event.shiftKey && current === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && current === last) {
        event.preventDefault();
        first.focus();
      }
    }

    container.addEventListener("keydown", onKeyDown);
    return () => {
      container.removeEventListener("keydown", onKeyDown);
      previous?.focus();
    };
  }, [active, ref]);
}
```

- [ ] **Step 2: Apply to all 9 modals**

```bash
grep -rln 'aria-modal="true"' packages/renderer/src
```

For each file returned, add a container ref and call `useFocusTrap(ref, isOpen)`. Apply the hook once per modal shell where one exists — if several modals share `ModalShell`, put it there and the count drops to one call site.

- [ ] **Step 3: Add the enforcement rule**

Append to `packages/renderer/tests/quality-floor.test.ts`:

```ts
it("every aria-modal=true element uses the focus trap", () => {
  const files = walkSource(resolve(ROOT, "src")).filter((f) =>
    readFileSync(f, "utf8").includes('aria-modal="true"'),
  );
  expect(files.length).toBeGreaterThan(0);
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    expect(
      source.includes("useFocusTrap"),
      `${file} promises aria-modal="true" without useFocusTrap`,
    ).toBe(true);
  }
});
```

This is the artifact: a tenth modal that declares the attribute without the hook now fails the suite.

- [ ] **Step 4: Behavioural test**

```tsx
it("keeps Tab inside the dialog and restores focus on close", async () => {
  const trigger = document.createElement("button");
  document.body.appendChild(trigger);
  trigger.focus();

  const { unmount } = render(<SettingsModal open />);
  for (let i = 0; i < 12; i++) await userEvent.tab();
  expect(
    document.activeElement?.closest('[role="dialog"]'),
  ).not.toBeNull();

  unmount();
  expect(document.activeElement).toBe(trigger);
});
```

- [ ] **Step 5: Run, see it red, commit**

```bash
nvm use 20
pnpm --filter @f-mark/renderer exec vitest run tests/a11y tests/quality-floor.test.ts
```

Remove `useFocusTrap` from one modal, re-run, expect the quality-floor rule to FAIL naming that file. Restore.

```bash
git add packages/renderer/src/a11y packages/renderer/src/modals packages/renderer/src/overlays packages/renderer/tests
git commit -m "fix(a11y): contain and restore focus in every modal that claims aria-modal"
```

---

## Task 12: C3b/c/d — roving tabindex, the suppressed ring, touch targets

**Files:**
- Create: `packages/renderer/src/a11y/useRovingTabIndex.ts`
- Modify: `ViewModeToggle.tsx`, `CenterDockTabs.tsx`, `DockAreaTabs.tsx`, `RightPanelTabs.tsx`, `SettingsSidebar.tsx`, `ThemePicker.tsx`, `FontPicker.tsx`, `Appearance.tsx`
- Modify: `packages/renderer/src/panels/fileViewer/TabItem.tsx:69-85`
- Modify: `packages/renderer/src/shell/shell.css:2867-2871`

- [ ] **Step 1: The roving hook**

```ts
import { useCallback, type KeyboardEvent } from "react";

/** Arrow-key roving for a composite widget. A role="tablist" or
    role="radiogroup" promises this keyboard pattern; declaring the role
    without it is the a11y equivalent of an unimplemented interface. */
export function useRovingTabIndex(
  count: number,
  activeIndex: number,
  onSelect: (index: number) => void,
): {
  tabIndexFor: (index: number) => 0 | -1;
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
} {
  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>): void => {
      const delta =
        event.key === "ArrowRight" || event.key === "ArrowDown"
          ? 1
          : event.key === "ArrowLeft" || event.key === "ArrowUp"
            ? -1
            : 0;
      if (delta === 0) return;
      event.preventDefault();
      onSelect((activeIndex + delta + count) % count);
    },
    [activeIndex, count, onSelect],
  );

  return {
    tabIndexFor: (index: number) => (index === activeIndex ? 0 : -1),
    onKeyDown,
  };
}
```

- [ ] **Step 2: Apply to the seven composites**

Each already tracks an active index. Wire `onKeyDown` on the container and `tabIndex={tabIndexFor(i)}` on each item.

- [ ] **Step 3: H6 — make file-viewer tabs reachable**

`TabItem.tsx:69-85` renders `<div role="tab" draggable onClick=…>` with **no `tabIndex`**. Verified live: `tabIndex: -1`, `hasAttribute('tabindex')` false. Tab order goes from one tab's Pin button straight to the next tab's Close button, so a keyboard-only user can pin and close tabs but can never switch which file is active.

Add `tabIndex` from the roving hook plus an `onKeyDown` that activates on Enter/Space.

**The tab is also `draggable` with a full drag-reorder implementation.** Adding `onKeyDown` must not swallow the drag handlers, and adding `tabIndex` changes the tab order around the existing Pin and Close buttons. After wiring, manually verify drag-reorder still works and that Tab now lands on the tab surface itself.

- [ ] **Step 4: M6 — delete the outline suppression**

`.panel-search input { outline: 0 }` at `shell.css:2867-2871` has specificity `0-1-1` and beats the global focus rule's effective `0-1-0`, because `:where()` zeroes its argument's specificity. Confirmed by computed style after a real Tab: `outline: … none 0px`.

**Delete the `outline: 0;` line.** The global ring then applies. No replacement rule is needed.

- [ ] **Step 5: Add the third quality-floor rule**

`interaction.css:29-32` already states the rule — *"Never suppress the ring without replacing it"* — and nothing enforces it. This is the third blind spot in the focus guard: it catches transitioned rings and a deleted global reset, but not suppression.

```ts
it("no rule suppresses the focus ring without replacing it", () => {
  for (const file of cssFiles()) {
    const source = readFileSync(file, "utf8");
    const blocks = source.split("}");
    for (const block of blocks) {
      if (!/outline\s*:\s*(0|none)/.test(block)) continue;
      const selector = block.split("{")[0] ?? "";
      if (!/input|button|a\b|\[tabindex|textarea|select/.test(selector)) continue;
      expect(
        source.includes(`${selector.trim()}:focus-visible`),
        `${file}: ${selector.trim()} suppresses the ring with no :focus-visible replacement`,
      ).toBe(true);
    }
  }
});
```

- [ ] **Step 6: M13 — raise touch targets**

Command palette and settings buttons are 15×32px; `+` is 28×28px, against a ~44px guideline. Raise the *hit* area without changing visual size — the density is deliberate in a dense tool:

```css
.icon-button::before {
  content: "";
  position: absolute;
  inset: 50% auto auto 50%;
  width: 44px;
  height: 44px;
  transform: translate(-50%, -50%);
}
```

Requires `position: relative` on `.icon-button`. Verify the overlays do not intercept clicks intended for neighbours — at 1440 the top-bar buttons sit close together.

- [ ] **Step 7: Run, see each new rule red, commit**

```bash
nvm use 20
pnpm --filter @f-mark/renderer run lint
pnpm --filter @f-mark/renderer exec vitest run tests/quality-floor.test.ts tests/a11y
```

Re-add `outline: 0` to `.panel-search input`, re-run, expect the new rule to FAIL. Remove it again.

```bash
git add packages/renderer/src packages/renderer/tests
git commit -m "fix(a11y): add roving tabindex, restore the search ring, widen touch targets"
```

---

## Task 13: C7 — mechanical nits

- [ ] **Step 1: Delete dead CSS**

`.tool-head:focus-visible` (`agent-components.css:540`) can never match — `.tool-head` is a `<div>` with no `tabindex`; the real control is the nested `.tool-head-toggle`. Delete the rule.

- [ ] **Step 2: `dir="auto"` on the compose textarea**

Currently fixed `direction: ltr`, so RTL text does not align while typing. The stored content is already correct; this is display only.

- [ ] **Step 3: Skip no-op todo supersessions**

The todo composer logs redundant no-op UPDATE supersessions on rapid Enter. It never duplicates a *visible* todo, so this is not in the comment composer's camp (M3) — but in an append-only log, writing nothing is better than writing a no-op. Compare the patch against current values and skip when nothing changed.

- [ ] **Step 4: Decide on `useSpawnTerminalAction.ts`**

`components/participantStrip/useSpawnTerminalAction.ts` has zero call sites outside its own file. It spawns a plain terminal and opens the overlay — a working, safe path that nothing in the UI wires up. Its absence is what made `TerminalOverlay` unauditable during the sweep.

**Wire it up rather than deleting it.** Add the spawn action to the participant strip's overflow menu. That both removes the dead code and gives the next sweep a route to `TerminalOverlay`.

- [ ] **Step 5: Leave three alone, deliberately**

Record each decision in the commit body so the next reader does not re-open them.

- **`document.body` has no background-color** — invisible in practice, every surface paints its own.
- **Nested-dialog artifact** — the Presets popover's `role="dialog" aria-modal="false"` element remaining in the DOM beneath the Preset editor is harmless and, unlike the modals in Task 11, correctly declared.
- **M14 — session delete is a real recursive delete** (`kernel/src/sessions.ts:302-307`, `rm(sessionDir, { recursive: true })`, verified live: `DELETE` → 204, directory gone). This is an architectural exception in an append-only app, not a bug. The confirm wording — "Project files are not deleted" — was checked during the sweep and is accurate and correctly scoped, and Task 2's rebase adds `31f8fec fix(sessions): say that delete destroys the event log`. **No further action.** Recorded here so it is not re-filed as a finding by the next sweep.

- [ ] **Step 6: Commit**

```bash
git add packages/renderer/src
git commit -m "chore(ui): clear dead CSS, honour RTL input, wire the terminal spawn action"
```

---

## Task 14: C4 — clamp the centre pane (BL2)

At 768px the centre pane gets 140px, the compose toolbar's button groups overlap, and the Fork icon physically covers the Skills button — `document.elementFromPoint` on the Skills button's own centre returns the Fork icon's `<path>`, and a real Playwright click times out on pointer interception. At 375px the centre pane computes to **0 width** and the page scrolls horizontally.

**The earlier plan called this expensive and said CSS could not fix it. That was wrong.** `themes/layout.ts:145` emits `var(--pane-w-<pane>, 288px)` into a grid track — `DEFAULT_WIDTH` is only the fallback. The track is CSS, so the floor goes in one function.

**Files:**
- Modify: `packages/renderer/src/themes/layout.ts:144-150`
- Test: `packages/renderer/tests/themes/layout.test.ts`

- [ ] **Step 1: Clamp the track**

```ts
/* Side panes never take so much width that the centre pane collapses. The
   viewport share is the floor the centre pane keeps; below it the side pane
   shrinks instead. Without this the centre pane reaches 0px under ~400px. */
const MIN_CENTRE_PX = 360;

function colTrack(pane: PaneId): string {
  if (pane === paneIds.chat) return gridTracks.flexible;
  return `min(var(${widthVar(pane)}, ${DEFAULT_WIDTH[pane]}px), calc((100vw - ${MIN_CENTRE_PX}px) / 2))`;
}
```

`rowTrack` needs the same treatment only if a stacked layout can collapse the centre pane vertically — check `layoutKinds.rows` and `bandSplit` and apply symmetrically if so.

- [ ] **Step 2: Verify saved layouts still migrate**

The dock engine persists layout to localStorage and `dock-migration-v5` tests exist. A width change must not corrupt or invalidate saved layouts:

```bash
nvm use 20
pnpm --filter @f-mark/renderer exec vitest run tests/ --reporter=verbose 2>&1 | grep -i "dock-migration"
```

Expected: all dock-migration tests pass unchanged. The clamp is presentational — it changes the emitted track string, not the stored width — so a stored 340 stays 340 and simply renders narrower on a small viewport.

- [ ] **Step 3: Test the clamp**

```ts
it("floors the centre pane by shrinking the side track", () => {
  const track = colTrack(paneIds.rightPanel);
  expect(track).toContain("min(");
  expect(track).toContain("100vw");
});

it("leaves the centre pane flexible", () => {
  expect(colTrack(paneIds.chat)).toBe(gridTracks.flexible);
});
```

- [ ] **Step 4: Verify in a browser at three viewports**

Start a kernel against a scratch root and measure, rather than eyeballing:

```
1440 → side panes at their stored widths, centre unchanged from today
768  → centre pane ≥ 360px; Skills button's centre returns the Skills button
375  → centre pane > 0; document.scrollWidth === 375 (no horizontal scroll)
```

The 768 check is the one that matters: `document.elementFromPoint(x, y)` on the Skills button's own centre must return the Skills button, not the Fork icon's `<path>`.

- [ ] **Step 5: Commit**

```bash
git add packages/renderer/src/themes/layout.ts packages/renderer/tests/themes
git commit -m "fix(layout): keep a floor under the centre pane on narrow viewports"
```

**Deferred deliberately:** collapse-to-overlay (side panels as slide-over drawers below ~1024px) is correct behaviour and significantly more work — it touches the dock engine's placement math for all 36 placements. It is its own project. The Blocker here is "controls cannot be clicked", and the floor fixes exactly that.

---

## Task 15: C5 — event semantics (M2, M3) — SHIPS ALONE

**This task must not share a commit with anything else.** It changes what a stored value *means* across renderer *and* kernel, and this log is append-only: a bad write is permanent and can only be masked.

### What the research found

Two mechanisms exist for deletion and only one is understood outside the renderer:

| Mechanism | Shape | Honoured by |
| --------- | ----- | ----------- |
| Generic tombstone | `removed: true` frontmatter | `kernel/events/visible.ts:6-10` |
| Comment removal | content marker `"_removed_"` | **renderer only** (`comments/commentMarkers.ts:5`) |

So a removed comment is a *visible* prose event containing `_removed_` to search, the inbox, and all 23 `fmark_*` MCP tools — the agent-facing surfaces of an agent-collaboration product.

### CORRECTED DURING EXECUTION — the planned fix is forbidden by the kernel

The plan above said to make comment removal write `removed: true`. **The kernel rejects that write.**

`ProseFrontmatterValidator.validateCommentPayload` returns the error **"comments cannot be tombstones"** for any payload with `mode: "comment"` and `removed: true`. And `buildPostProseBody` → `targetBodyForGroup` **always** adds `mode: "comment"` to a non-file comment. So every line and card comment removal would be rejected outright.

That is not an oversight to route around. It is a deliberate invariant, and it is *why* the renderer invented the content marker in the first place. Two further facts settle the design:

- **`getProseRole` ranks `mode: "comment"` above `removed: true`**, so even if the write were allowed the marker would classify as `comment`, never `tombstone`.
- **`applySupersession` already hides the comment the marker supersedes.** The original comment was never the leak. **Only the marker itself leaks.**

**So the fix is to teach the kernel to read the marker, not to change what is written.** This is strictly better than the original plan:

| | Write a tombstone instead | Teach `visible.ts` the marker |
| - | ------------------------- | ----------------------------- |
| Kernel invariant | fights it | respects it |
| Historical `_removed_` markers | still leak forever | fixed too |
| Append-only risk | changes what gets written | changes nothing on disk |
| Blast radius | `getProseRole` precedence, every role consumer | one filter function |

The enforcement artifact stays as planned — a shared predicate in `@f-mark/shared` used by both packages — but it now earns its place, because kernel and renderer genuinely both read the marker.

The third trap stands unchanged: **the marker string is duplicated in three src files** — `comments/commentMarkers.ts:5`, `panels/right/comments/commentModel.ts:22`, `state/aggregate/EventAggregator.ts:36` — so a half-migrated reader is a real risk.

- [x] **Step 1: Put the marker vocabulary in `@f-mark/shared`** — DONE

Created `packages/shared/src/commentMarkers.ts` exporting `COMMENT_MARKER_CONTENT`, `isCommentRemovedMarker`, `isCommentResolutionMarker` and `isCommentMarkerEvent`, and re-exported it from `shared/src/index.ts`. Its header records why the tombstone route is closed, so the next reader does not retry it.

A marker requires **both** the exact trimmed content **and** a `supersedes` pointer. Requiring `supersedes` is what stops a real comment that merely discusses the string `_removed_` from being swallowed.

- [x] **Step 2: Hide the marker from visible reads** — DONE

`packages/kernel/src/events/visible.ts` — `isProseTombstone` is now joined by `isCommentMarkerEvent` behind one `isSupersessionMarker` predicate. Nothing else in the kernel changes, because `applySupersession` already drops the superseded comment.

- [x] **Step 3: Collapse the three duplicated constants** — DONE

`comments/commentMarkers.ts` now re-exports the shared constant instead of declaring its own; `commentModel.ts:22` and `EventAggregator.ts:36` reference `COMMENT_MARKER_CONTENT` rather than repeating the literal. One definition, three readers.

- [x] **Step 4: Nothing written to the log changes** — BY DESIGN

`removeComment` still posts `content: "_removed_"` + `supersedes`. That is now the deliberate, documented mechanism rather than an accident, and every historical marker already on disk is fixed by the same change.

- [ ] **Step 5: Hand-trace every consumer**

This is the step reviewers skip, and it is the whole reason this task ships alone. For each of the following, state in the commit body what changes and why it is safe:

| Consumer | Question to answer |
| -------- | ------------------ |
| `kernel/events/visible.ts` | Does the new marker get hidden? (It reads `payload.removed === true` directly — yes.) |
| `applySupersession` | Does the *target* comment still get dropped? (It reads `supersedes` — yes, unchanged.) |
| `getProseRole` | Which branch does the new marker hit? Answer from Step 1. |
| `createChainRootResolver` | It stops at `isMarkerEvent`. If the marker is now hidden from the renderer entirely, does chain resolution still terminate correctly? |
| `buildCommentGroups` | The badge correctly read 0 during the sweep despite 16 raw comment events. Does it still? |
| 23 `fmark_*` MCP tools | They read through `readVisibleEvents`, so they should now see neither the comment nor the marker. Confirm with a live `read_events`. |

- [ ] **Step 6: M3 — double-submit guard for the comment composer**

Recovered from sweep artifacts: two identical comment events 1ms apart, both roots (`20260804T084147.704Z` / `.705Z`). Compose's Send is correctly guarded by `inFlightRef` — verified, 3 rapid clicks produced exactly 1 POST. The comment composer is not.

**Reuse `inFlightRef`; do not invent a second pattern.** `useCommentPoster` already tracks `busyKey`, so the guard has a natural home:

```ts
if (busyKey !== null) return;
setBusyKey(key);
try { /* …post… */ } finally { setBusyKey(null); }
```

In an append-only log a duplicate is permanent and can only be masked — which, before this task, meant masking it with a `_removed_` marker, compounding M2.

- [ ] **Step 7: Test both halves**

```ts
it("writes a removed tombstone rather than a content marker", async () => {
  const post = vi.fn();
  await removeComment(group, event);
  expect(post.mock.calls[0]?.[2]).toMatchObject({
    content: "",
    removed: true,
    supersedes: event.filename,
  });
});

it("still recognises historical content markers", () => {
  expect(
    isRemovedMarker(proseEvent({ content: "_removed_", supersedes: "x" })),
  ).toBe(true);
});

it("posts a comment once under rapid double submit", async () => {
  const post = vi.fn().mockImplementation(() => new Promise((r) => setTimeout(r, 20)));
  await Promise.all([submit(), submit(), submit()]);
  expect(post).toHaveBeenCalledTimes(1);
});
```

The second test is the backward-compatibility guard and is the most important of the three.

- [ ] **Step 8: Kernel test**

```ts
it("hides a comment removal tombstone from visible reads", async () => {
  await writeProse({ content: "", removed: true, supersedes: target });
  const visible = await readVisibleEvents(paths, sessionId, {});
  expect(visible.map((e) => e.filename)).not.toContain(target);
  expect(JSON.stringify(visible)).not.toContain("_removed_");
});
```

- [ ] **Step 9: Full-suite run, both packages**

```bash
nvm use 20
pnpm --filter @f-mark/renderer run lint
npx tsc -b
pnpm --filter @f-mark/renderer exec vitest run
pnpm --filter f-mark exec vitest run
```

Diff by **test name** against the baseline. Any newly-red name involving comments, threading, or prose roles is a propagation failure — investigate, do not rationalise.

- [ ] **Step 10: Live verification against a scratch kernel**

```bash
node scripts/dev.mjs --no-auth --port 7788 --path <scratch>/c5/project
```

Post a comment, remove it, then confirm through the app's own surfaces that `_removed_` appears in neither search results nor `read_events` output. This is the finding's actual claim, and only a live kernel can settle it.

- [ ] **Step 11: Commit alone**

```bash
git add packages/renderer packages/kernel
git commit -m "fix(comments): remove via the documented tombstone, guard double submit"
```

The commit body records the Step 1 answer and the Step 5 trace table.

---

## Verification gates — every task

1. `pnpm run lint` **first, as its own gate.**
2. `npx tsc -b`.
3. Full vitest under **Node 20**, both packages.
4. Diff failures **per test name** against `docs/ui-sweep/2026-08-02-test-baseline.json`.
5. For every new guard: **plant the bypass, watch it fail, remove it.**
6. Re-run the affected `ui-sweep` unit against a live kernel for anything with a browser-verified repro: BL3 (U7), BL4 (U12), BL5 (U9), H2-H4 (U6), H6 (U10), BL2 (U1 at 768/375).

## Coherence check — run once, after Task 15

The point of clustering was that the system is *more* coherent afterwards, not just less broken. Confirm all five:

- [ ] **One way to confirm a destructive action.** `grep -rn "window.confirm" packages/renderer/src` returns hits only inside `useConfirmDestructive.ts`. Every other destructive path goes through `ConfirmedIntent`.
- [ ] **One way to close a popover.** `usePopoverExit` is gone; every popover mount site derives from `useDeferredUnmount`; no mount site gates on a raw open flag.
- [ ] **One way to declare a modal.** Every `aria-modal="true"` site calls `useFocusTrap`; every composite role has a keyboard pattern.
- [ ] **One way to delete.** New comment removals write `removed: true`; the content-marker reader remains for history; the marker string is defined once.
- [ ] **One meaning per channel still holds.** Re-run `tests/token-contrast.test.ts` and confirm `--alarm` is still used only for destructive/error semantics after Task 3 added it to the terminal kill button.

## Open question for Oran

**Task 14** assumes clamping the centre pane now, with collapse-to-overlay deferred as its own project. If you want a real mobile layout in this branch instead, Task 14 grows from one function to a dock-engine project and should be pulled out of this plan entirely.
