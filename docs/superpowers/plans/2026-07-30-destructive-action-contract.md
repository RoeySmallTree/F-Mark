# Destructive Action Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make it impossible to call a destructive F-Mark operation without a human confirmation, and fix the five places that currently do.

**Architecture:** Introduce one confirmation primitive in the renderer that returns a branded
`ConfirmedIntent` receipt. Destructive API-client methods take that receipt as a required parameter, so
a call site that skips confirmation fails to compile rather than failing in production. Presentation
stays `window.confirm` for now — the receipt is the load-bearing part and the dialog is swappable
behind it without touching any call site. Blast radius for cascading deletes comes from the server that
performs the cascade, never re-derived on the client.

**Tech Stack:** TypeScript, React 18, Zustand, Vitest 2 + @testing-library/react 16 + jsdom (renderer);
Fastify + Vitest 2 (kernel); pnpm workspaces.

**Source:** `docs/ui-sweep/2026-07-30-remediation.md` § Cluster A. Closes B1, B2, H1, H2, M2, A6.

## Global Constraints

- **No TDD.** Implementation first, tests after — per `~/.claude/CLAUDE.md`. This deliberately departs
  from the writing-plans skill default; user instructions outrank skills.
- **Functional style.** `const` by default, avoid classes, functions under 30 lines, explicit over
  clever, no unnecessary comments.
- **Commits:** imperative mood, concise, no emojis. One logical change per commit.
- **Branch:** work on `feature/destructive-action-contract`. Never push to main.
- **Workspace filter names are `f-mark`, `@f-mark/renderer`, `@f-mark/shared`.** There is no package
  named `kernel` — see Task 1.
- **Renderer source imports use `.js` extensions; renderer _test_ files import without them.** Match the
  file you are editing.
- **Never delete pre-existing user data** while testing. Destructive behaviour is exercised against
  fixtures you created.

### Recorded test baseline (measured 2026-07-30, Node v25.8.1, macOS)

`pnpm -F f-mark test` → **31 failed / 1157 passed (138 files, 9 failed files)**. Failing files:

```
tests/git/revert.test.ts                            tests/routes/paths.test.ts
tests/git/routes.test.ts                            tests/routes/rootScope.test.ts
tests/git/service.test.ts                           tests/routes/sessions.test.ts
tests/routes/fs.test.ts                             tests/routes/managedAgents.test.ts
tests/routes/managedAgentsCrossProjectControl.test.ts
```

**These fail before you change anything.** CI runs Node 20; local is Node 25, and the failures are
believed to be Node-25/macOS artifacts. Every "expect PASS" below means _"no worse than this baseline"_.

Two of these files cover code this plan touches — `tests/git/revert.test.ts` (Task 7) and
`tests/routes/managedAgents.test.ts` (Task 3). For those tasks, capture the file's pass/fail count
before your change and compare after. **Do not treat a pre-existing failure as yours, and do not let a
new failure hide inside the baseline.**

---

## File Structure

**New — the primitive (Task 2):**

| File                                                           | Responsibility                                                         |
| -------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `packages/renderer/src/confirm/intent.ts`                      | The `ConfirmedIntent` branded type and its private mint. Nothing else. |
| `packages/renderer/src/confirm/useConfirmDestructive.ts`       | The only legal way to obtain a receipt. Owns presentation.             |
| `packages/renderer/src/confirm/index.ts`                       | Barrel. Exports the hook and the _type_ only — never the mint.         |
| `packages/renderer/src/confirm/intent.test.ts`                 | Covers mint/brand behaviour.                                           |
| `packages/renderer/src/confirm/useConfirmDestructive.test.tsx` | Covers confirm/cancel paths.                                           |

**Modified:**

| File                                                                                         | Change                                              | Task |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------- | ---- |
| `.github/workflows/ci.yml`                                                                   | Fix the filter that silently skips the kernel build | 1    |
| `packages/renderer/src/api/client.ts`                                                        | Destructive methods require `ConfirmedIntent`       | 2    |
| `packages/renderer/src/panels/right/terminal/useAgentTerminalsController.ts`                 | `close` stops ending the agent                      | 3    |
| `packages/kernel/src/routes/managedAgents/spawnRoutes/confirmTokens.ts`                      | Rename to what it actually is                       | 4    |
| `packages/renderer/src/components/ParticipantStrip.tsx`                                      | Chip actions gain confirmation                      | 5    |
| `packages/renderer/src/panels/right/agents/RightAgentControls.tsx`                           | Migrate to the primitive                            | 5    |
| `packages/renderer/src/panels/right/agents/AgentPopover.tsx`                                 | Migrate to the primitive                            | 5    |
| `packages/renderer/src/panels/sessions/useSessionDelete.ts`                                  | Honest wording + primitive                          | 6    |
| `packages/renderer/src/panels/fileViewer/diff/hunkActionsBar/useHunkActionsBarController.ts` | Confirm before revert                               | 7    |
| `packages/renderer/src/panels/fileViewer/diff/hunkActionsBar/model.ts`                       | Honest hunk label                                   | 7    |
| `packages/kernel/src/routes/todos.ts`                                                        | Descendant preflight endpoint                       | 8    |
| `packages/renderer/src/cards/todoItem/useTodoItemController.ts`                              | Cascade count from server                           | 8    |
| `packages/renderer/src/modals/settings/runtimes/RuntimeTable.tsx`                            | Confirm runtime removal                             | 9    |

---

### Task 1: Make CI actually build the kernel

Every later task's verification gate depends on CI being real. It currently is not.

**Files:**

- Modify: `.github/workflows/ci.yml:22-23`

**Interfaces:**

- Consumes: nothing
- Produces: a CI run that fails on kernel TypeScript errors

- [ ] **Step 1: Confirm the bug yourself**

```bash
pnpm -F kernel exec node -e "console.log('MATCHED')"; echo "exit=$?"
```

Expected: `No projects matched the filters` and **`exit=0`**. That exit code is the bug — CI lines 22
and 23 pass while doing nothing, so `packages/kernel`'s `tsc` never runs on any PR.

- [ ] **Step 2: Fix the filter**

In `.github/workflows/ci.yml`, replace lines 22-23:

```yaml
- run: pnpm -F f-mark build
- run: pnpm -F f-mark build:bundle
```

- [ ] **Step 3: Verify the filter now matches**

```bash
pnpm -F f-mark exec node -e "console.log('MATCHED')"
```

Expected: prints `MATCHED`.

- [ ] **Step 4: Run the build the way CI now will**

```bash
pnpm -F @f-mark/shared build && pnpm -F @f-mark/renderer build && pnpm -F f-mark build
```

Expected: all three succeed. **If `pnpm -F f-mark build` reports TypeScript errors, stop.** Those are
pre-existing errors that CI has never seen. Record them, fix them in this task, and note them in the
commit body — this task is not done while the gate it installs is red.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "fix(ci): build the kernel package by its real name

pnpm -F kernel matched no projects and exited 0, so the kernel build and
bundle steps silently passed without running. The package is named f-mark."
```

---

### Task 2: The confirmation primitive

**Files:**

- Create: `packages/renderer/src/confirm/intent.ts`
- Create: `packages/renderer/src/confirm/useConfirmDestructive.ts`
- Create: `packages/renderer/src/confirm/index.ts`
- Test: `packages/renderer/src/confirm/intent.test.ts`
- Test: `packages/renderer/src/confirm/useConfirmDestructive.test.tsx`

**Interfaces:**

- Consumes: nothing
- Produces:
  - `type ConfirmedIntent` — opaque branded receipt
  - `useConfirmDestructive(): (request: ConfirmRequest) => Promise<ConfirmedIntent | null>`
  - `interface ConfirmRequest { action: string; title: string; detail?: string }`
  - Returns `null` when the human cancels. Every later task consumes exactly this.

- [ ] **Step 1: Write the branded type**

Create `packages/renderer/src/confirm/intent.ts`:

```ts
declare const confirmedIntentBrand: unique symbol;

/** Proof that a human confirmed a destructive action. Obtainable only from
    useConfirmDestructive — never construct one directly. */
export interface ConfirmedIntent {
  readonly [confirmedIntentBrand]: true;
  readonly action: string;
}

export function mintConfirmedIntent(action: string): ConfirmedIntent {
  return { action } as unknown as ConfirmedIntent;
}
```

- [ ] **Step 2: Write the hook**

Create `packages/renderer/src/confirm/useConfirmDestructive.ts`:

```ts
import { useCallback } from "react";
import type { ConfirmedIntent } from "./intent.js";
import { mintConfirmedIntent } from "./intent.js";

export interface ConfirmRequest {
  /** Stable identifier for the action, e.g. "agent.goodbye". */
  action: string;
  /** The question. Names the thing being destroyed. */
  title: string;
  /** What is irreversibly lost. Omit only when nothing is. */
  detail?: string;
}

function promptText(request: ConfirmRequest): string {
  return request.detail === undefined
    ? request.title
    : `${request.title}\n\n${request.detail}`;
}

export function useConfirmDestructive(): (
  request: ConfirmRequest,
) => Promise<ConfirmedIntent | null> {
  return useCallback(
    async (request: ConfirmRequest): Promise<ConfirmedIntent | null> =>
      window.confirm(promptText(request))
        ? mintConfirmedIntent(request.action)
        : null,
    [],
  );
}
```

- [ ] **Step 3: Write the barrel**

Create `packages/renderer/src/confirm/index.ts`:

```ts
export type { ConfirmedIntent } from "./intent.js";
export type { ConfirmRequest } from "./useConfirmDestructive.js";
export { useConfirmDestructive } from "./useConfirmDestructive.js";
```

`mintConfirmedIntent` is deliberately absent. Call sites import from `./confirm/index.js`, so the mint
is unreachable without deep-importing `confirm/intent.js` — which review rejects.

- [ ] **Step 4: Require the receipt on destructive client methods**

In `packages/renderer/src/api/client.ts`, add the import and a required trailing parameter to the
destructive methods. `goodbye` is the one this plan exercises first:

```ts
import type { ConfirmedIntent } from "../confirm/index.js";
```

Change `goodbye`'s signature so the receipt is required and unused-but-present:

```ts
  async goodbye(
    participantId: string,
    token: string,
    scope: RootScope,
    intent: ConfirmedIntent,
  ): Promise<void> {
    void intent;
```

Leave the body otherwise unchanged. `void intent` documents that the parameter exists for
compile-time enforcement, not runtime behaviour — the server cannot verify it and must not pretend to.

- [ ] **Step 5: Typecheck and see the intended failures**

```bash
pnpm -F @f-mark/renderer build
```

Expected: **FAILS**, listing every current `goodbye` call site as missing an argument. That list is your
work queue for Tasks 3 and 5. Write it down. A clean build here means the parameter isn't required and
Step 4 is wrong.

- [ ] **Step 6: Write the tests**

Create `packages/renderer/src/confirm/intent.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mintConfirmedIntent } from "./intent";

describe("mintConfirmedIntent", () => {
  it("carries the action identifier", () => {
    expect(mintConfirmedIntent("agent.goodbye").action).toBe("agent.goodbye");
  });
});
```

Create `packages/renderer/src/confirm/useConfirmDestructive.test.tsx`:

```ts
import { afterEach, describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useConfirmDestructive } from "./useConfirmDestructive";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useConfirmDestructive", () => {
  it("returns a receipt when the human accepts", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { result } = renderHook(() => useConfirmDestructive());
    const intent = await result.current({ action: "a.b", title: "Delete?" });
    expect(intent?.action).toBe("a.b");
  });

  it("returns null when the human cancels", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const { result } = renderHook(() => useConfirmDestructive());
    expect(
      await result.current({ action: "a.b", title: "Delete?" }),
    ).toBeNull();
  });

  it("includes the detail line in the prompt", async () => {
    const spy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const { result } = renderHook(() => useConfirmDestructive());
    await result.current({
      action: "a.b",
      title: "Delete?",
      detail: "Gone forever.",
    });
    expect(spy.mock.calls[0]?.[0]).toContain("Gone forever.");
  });
});
```

- [ ] **Step 7: Run the new tests**

```bash
pnpm -F @f-mark/renderer exec vitest run src/confirm
```

Expected: 4 passed.

- [ ] **Step 8: Commit**

```bash
git add packages/renderer/src/confirm packages/renderer/src/api/client.ts
git commit -m "feat(confirm): add ConfirmedIntent receipt required by destructive client methods"
```

The renderer build is knowingly red until Task 5 lands. Say so in the PR; do not merge this task alone.

---

### Task 3: Stop the terminal tab's × from destroying the agent (B2)

**Files:**

- Modify: `packages/renderer/src/panels/right/terminal/useAgentTerminalsController.ts:144-184`
- Test: `packages/renderer/src/panels/right/terminal/useAgentTerminalsController.test.ts` (create)

**Interfaces:**

- Consumes: nothing from Task 2 — this task _removes_ the destructive call rather than confirming it
- Produces: `close(agent)` unmounts the terminal view and leaves the agent running

The file's own header comment at `AgentTerminals.tsx:12-14` already states the intended design: _"No
spawn/close — agents are created and ended through the agent lifecycle, not here."_ The comment is the
spec; the controller violates it. Restore the spec.

- [ ] **Step 1: Replace the close handler**

In `useAgentTerminalsController.ts`, replace the whole `close` callback (lines 144-184) with:

```ts
const close = useCallback(
  (agent: AgentTerminal): void => {
    setError(null);
    setMounted((prev) => {
      if (!prev.has(agent.tmux_session)) return prev;
      const next = new Set(prev);
      next.delete(agent.tmux_session);
      return next;
    });
    if (activeAgentTmux === agent.tmux_session) setActiveAgentTerminal(null);
  },
  [activeAgentTmux],
);
```

- [ ] **Step 2: Remove what is now unused**

Delete the `closing` state and its setter if nothing else references them, and drop `api`,
`currentScope`, `removeManagedAgent`, `removePresence` from this file's imports/destructuring **only if
no other callback in the file uses them**. Check first:

```bash
grep -n "closing\|removeManagedAgent\|removePresence\|currentScope" packages/renderer/src/panels/right/terminal/useAgentTerminalsController.ts
```

Remove only names with no remaining references. If `closing` is part of the returned controller type,
remove it from `types.ts` and from any consumer the typecheck flags.

- [ ] **Step 3: Fix the accessible name**

Find the control and correct its label — it closes a view, not an agent:

```bash
grep -rn "Close agent" packages/renderer/src/panels/right/terminal/
```

Change `aria-label={\`Close agent ${...}\`}` to `` aria-label={`Close ${...} terminal view`} ``.

- [ ] **Step 4: Typecheck**

```bash
pnpm -F @f-mark/renderer build
```

Expected: the `goodbye` error from Task 2 Step 5 no longer names this file. Errors remaining in
`ParticipantStrip.tsx` / `RightAgentControls.tsx` / `AgentPopover.tsx` are expected — Task 5 clears them.

- [ ] **Step 5: Write the test**

Create `packages/renderer/src/panels/right/terminal/useAgentTerminalsController.test.ts`.

**The invariant this test exists to protect:** calling `close()` must never invoke `goodbye`. Assert
that behaviourally — a test that reads the source and greps for the string would pass a refactor that
reintroduces the call through a wrapper.

`api` is built from `createManagedAgentsClient`, imported at line 3 from `../../../api/managedAgents.js`,
so that module is the mock boundary:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const goodbye = vi.fn();
const getConfirmToken = vi.fn();

vi.mock("../../../api/managedAgents.js", () => ({
  createManagedAgentsClient: () => ({
    goodbye,
    getConfirmToken,
    status: vi.fn().mockResolvedValue({ agents: [] }),
  }),
}));

import { useAgentTerminalsController } from "./useAgentTerminalsController";
import { useStore } from "../../../state/store";

const AGENT = {
  tmux_session: "fmark-test",
  participant_id: "ag-test",
  label: "Test",
  alive: true,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("agent terminal close", () => {
  it("never ends the agent", () => {
    const { result } = renderHook(() => useAgentTerminalsController());
    act(() => {
      result.current.close(AGENT);
    });
    expect(goodbye).not.toHaveBeenCalled();
    expect(getConfirmToken).not.toHaveBeenCalled();
  });

  it("unmounts the terminal view", () => {
    const { result } = renderHook(() => useAgentTerminalsController());
    act(() => {
      result.current.select(AGENT.tmux_session);
    });
    act(() => {
      result.current.close(AGENT);
    });
    expect(result.current.mountedSessions).not.toContain(AGENT.tmux_session);
  });
});
```

**If the hook's store or scope dependencies make `renderHook` fail**, seed the Zustand store directly
before rendering (`useStore.setState({ ... })` — `ToolUseCard.test.tsx` already imports `useStore`, so
that pattern works in this suite) and add `vi.mock` for
`../../../hooks/useCurrentSessionRootScope.js` returning `{ scope: null, scopeKey: "test" }`. Adapt the
setup as far as you need to. **What must not change is the assertion: `goodbye` is never called.** If
you cannot make the hook render at all after a genuine attempt, report `DONE_WITH_CONCERNS` describing
what blocked it rather than silently falling back to a source-text assertion.

The second test depends on `select()` marking the session mounted, which requires `alive: true` — if
`mountedSessions` is empty after `select`, the store lacks a matching agent; seed it as above.

- [ ] **Step 6: Run it**

```bash
pnpm -F @f-mark/renderer exec vitest run src/panels/right/terminal
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/renderer/src/panels/right/terminal
git commit -m "fix(terminal): close the terminal view without ending the agent

The per-agent tab close ran getConfirmToken then goodbye, permanently
destroying the agent and its tmux pane from a control shaped like a tab
close. AgentTerminals.tsx already documented that agents are ended through
the agent lifecycle, not here."
```

---

### Task 4: Rename the confirm-token to what it is

**Files:**

- Modify: `packages/kernel/src/routes/managedAgents/spawnRoutes/confirmTokens.ts`
- Modify: `packages/kernel/src/routes/managedAgents/spawnRoutes/lifecycleRoutes.ts`
- Modify: `packages/kernel/src/routes/managedAgents/spawnRoutes.ts`

**Interfaces:**

- Consumes: nothing
- Produces: no behaviour change. The HTTP route path stays `/managed-agents/:id/confirm-token` so the
  renderer and any external caller are unaffected.

A server cannot verify human confirmation — the client mints and spends the nonce in one code path,
legally. The name caused the misplaced trust that produced B2. Renaming is most of the fix.

- [ ] **Step 1: Add the explanatory comment**

At the top of `confirmTokens.ts`, above `CONFIRM_TTL_MS`:

```ts
/* A single-use nonce with a short TTL. It protects against replayed and
   double-submitted lifecycle calls — nothing more.

   It is NOT proof that a human confirmed anything: any client can mint and
   immediately spend one in the same code path. Human confirmation is a
   renderer-side contract (see renderer/src/confirm). Do not add server logic
   that assumes this token implies consent. */
```

- [ ] **Step 2: Rename the symbols**

Within these three files only, rename:

| From                       | To                     |
| -------------------------- | ---------------------- |
| `ConfirmTokenStore`        | `RequestNonceStore`    |
| `mintConfirm`              | `mintRequestNonce`     |
| `consumeConfirm`           | `consumeRequestNonce`  |
| `CONFIRM_TTL_MS`           | `REQUEST_NONCE_TTL_MS` |
| `confirmTokens` (variable) | `requestNonces`        |

Rename the file `confirmTokens.ts` → `requestNonces.ts` and update the two importers. **Leave the route
path string `/managed-agents/:id/confirm-token` unchanged** — it is a wire contract.

- [ ] **Step 3: Build and test**

```bash
pnpm -F f-mark build && pnpm -F f-mark exec vitest run tests/routes/managedAgents.test.ts
```

Expected: build succeeds. `managedAgents.test.ts` is in the recorded baseline as failing — capture its
failure count and confirm it is **unchanged**, not that it passes.

- [ ] **Step 4: Commit**

```bash
git add packages/kernel/src/routes/managedAgents
git commit -m "refactor(kernel): rename confirm-token to request nonce

The token is replay protection, not proof of human confirmation; a client
mints and spends it in one path. The old name invited callers to treat a
server guard as consent. Wire path is unchanged."
```

---

### Task 5: Confirmation parity for agent actions (H1)

**Files:**

- Modify: `packages/renderer/src/components/ParticipantStrip.tsx:160-198`
- Modify: `packages/renderer/src/panels/right/agents/RightAgentControls.tsx:126,163`
- Modify: `packages/renderer/src/panels/right/agents/AgentPopover.tsx:410,423`
- Modify: `packages/renderer/src/modals/settings/agents/useAgentsController.ts:109`
- Test: `packages/renderer/src/panels/right/agents/RightAgentControls.test.tsx` (create)

**Interfaces:**

- Consumes: `useConfirmDestructive`, `ConfirmedIntent` from Task 2
- Produces: every `goodbye` call site passes a receipt; renderer typecheck is green again

- [ ] **Step 1: Add confirmation to the chip popover**

In `ParticipantStrip.tsx`, add the hook at the top of the component:

```ts
import { useConfirmDestructive } from "../confirm/index.js";
```

```ts
const confirmDestructive = useConfirmDestructive();
```

Wrap the goodbye handler (around line 160-198) so it obtains a receipt first:

```ts
const onGoodbye = async (agent: Participant): Promise<void> => {
  const intent = await confirmDestructive({
    action: "agent.goodbye",
    title: `Remove ${agent.display_name}?`,
    detail: "Ends the agent and its terminal session. This cannot be undone.",
  });
  if (intent === null) return;
  const token = await api.getConfirmToken(agent.participant_id);
  await api.goodbye(agent.participant_id, token, currentScope, intent);
};
```

Apply the same shape to the chip's Clear-context handler with
`action: "agent.clear"`, `title: \`Clear ${agent.display_name}?\``, and
`detail: "Discards the agent's conversation context."`.

- [ ] **Step 2: Migrate the three surfaces that already confirm**

In `RightAgentControls.tsx`, `AgentPopover.tsx` and `useAgentsController.ts`, replace each bare
`window.confirm` guard with the primitive so all four surfaces share one contract. Example — the
existing `RightAgentControls.tsx:163`:

```ts
if (!window.confirm(`Remove ${agent.display_name}?`)) return;
```

becomes:

```ts
const intent = await confirmDestructive({
  action: "agent.goodbye",
  title: `Remove ${agent.display_name}?`,
  detail: "Ends the agent and its terminal session. This cannot be undone.",
});
if (intent === null) return;
```

and the subsequent `api.goodbye(...)` call gains `intent` as its fourth argument. The enclosing handler
must be `async`.

- [ ] **Step 3: Typecheck — this is the gate**

```bash
pnpm -F @f-mark/renderer build
```

Expected: **PASS**, with zero `goodbye` errors. The queue you recorded in Task 2 Step 5 is now empty.
A remaining error means a call site was missed — that is the parameter doing its job.

- [ ] **Step 4: Write the regression test**

**What actually needs a test here, and what does not.** After Task 2, `goodbye` cannot be called
without a `ConfirmedIntent` — the compiler rejects it, and Step 3's green build is that proof. So do
**not** write a test that scans these files for `useConfirmDestructive`; it would re-check a guarantee
the type system already gives, and it would pass a refactor that keeps the import while breaking the
gate.

The behaviour that is still unproven is the one that matters: **Cancel must actually cancel.**

Create `packages/renderer/src/panels/right/agents/RightAgentControls.test.tsx`, testing the simplest of
the three surfaces as the representative case:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from "@testing-library/react";

const goodbye = vi.fn();

vi.mock("../../../api/managedAgents.js", () => ({
  createManagedAgentsClient: () => ({
    goodbye,
    getConfirmToken: vi.fn().mockResolvedValue("nonce"),
  }),
}));

import { RightAgentControls } from "./RightAgentControls";

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("RightAgentControls remove", () => {
  it("does not end the agent when the human cancels", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<RightAgentControls {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /remove/i }));
    await waitFor(() => {
      expect(goodbye).not.toHaveBeenCalled();
    });
  });

  it("ends the agent when the human accepts", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<RightAgentControls {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /remove/i }));
    await waitFor(() => {
      expect(goodbye).toHaveBeenCalledTimes(1);
    });
  });
});
```

`props` is not defined above because it depends on `RightAgentControls`' actual prop type — read the
component and build a minimal literal (an agent with `display_name`, `participant_id`, and whatever
else is required). If the component needs store state, seed it with `useStore.setState({ ... })` as
`ToolUseCard.test.tsx` does. If the remove control's accessible name is not `/remove/i`, use the real
one from the component.

If `RightAgentControls` proves impractical to render, substitute `AgentPopover` or `ParticipantStrip` —
any one of the three is an acceptable representative. Report which you chose and why.

- [ ] **Step 5: Run the renderer suite**

```bash
pnpm -F @f-mark/renderer test
```

Expected: PASS, including lint and static-colors.

- [ ] **Step 6: Commit**

```bash
git add packages/renderer/src
git commit -m "fix(agents): confirm before ending an agent on every surface

The chip popover fired goodbye and clear-context with no dialog while the
right panel guarded both. All four surfaces now go through the shared
confirmation primitive."
```

---

### Task 6: Tell the truth in the session delete dialog (A6)

**Files:**

- Modify: `packages/renderer/src/panels/sessions/useSessionDelete.ts:16-20,45`
- Test: `packages/renderer/src/panels/sessions/useSessionDelete.test.ts` (create)

**Interfaces:**

- Consumes: `useConfirmDestructive` from Task 2
- Produces: unchanged delete behaviour, honest copy

The current text — _"Project files are not deleted."_ — is true and beside the point. The session's
event log **is** deleted (proved during the sweep: the on-disk directory disappears), and in a product
whose premise is a log you own, the log is the asset.

- [ ] **Step 1: Replace the confirmation**

Delete the `confirmDelete` function (lines 16-20). In `runDeleteSession`, replace line 45:

```ts
if (!confirmDelete(session)) return;
```

with:

```ts
const intent = await input.confirmDestructive({
  action: "session.delete",
  title: `Delete session "${session.slug}"?`,
  detail:
    "Permanently deletes this session's event log — every message, document, todo and comment in it. Your project files are untouched. This cannot be undone.",
});
if (intent === null) return;
```

- [ ] **Step 2: Thread the hook through the input**

Add to `UseSessionDeleteInput`:

```ts
confirmDestructive: (request: ConfirmRequest) =>
  Promise<ConfirmedIntent | null>;
```

with `import type { ConfirmRequest, ConfirmedIntent } from "../../confirm/index.js";`. Then typecheck to
find the caller that constructs this input and supply `confirmDestructive: useConfirmDestructive()`
there:

```bash
pnpm -F @f-mark/renderer build
```

Expected: one error naming the construction site. Fix it, then rebuild to green.

- [ ] **Step 3: Write the test**

This hook is the most testable thing in the plan: `confirmDestructive` now arrives through its input
object, so you inject a fake instead of mocking a dialog.

Create `packages/renderer/src/panels/sessions/useSessionDelete.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const deleteSession = vi.fn().mockResolvedValue(undefined);

vi.mock("../../api/client.js", () => ({
  createClient: () => ({ deleteSession }),
}));

import { useSessionDelete } from "./useSessionDelete";

const SESSION = { id: "s1", slug: "my-session", path: "/tmp/p" };

function inputWith(
  confirmDestructive: (r: unknown) => Promise<unknown>,
): Parameters<typeof useSessionDelete>[0] {
  return {
    confirmDestructive,
    activePath: "/tmp/p",
    activePathId: "p1",
    allSessions: [SESSION],
    currentSessionId: "s1",
    token: "t",
    closeContextMenu: vi.fn(),
    setAllSessions: vi.fn(),
    setCurrentSession: vi.fn(),
    setError: vi.fn(),
    refreshSelectedRootSessions: vi.fn().mockResolvedValue(undefined),
  } as unknown as Parameters<typeof useSessionDelete>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useSessionDelete", () => {
  it("does not delete when the human cancels", async () => {
    const { result } = renderHook(() =>
      useSessionDelete(inputWith(async () => null)),
    );
    await act(async () => {
      await result.current(SESSION as never);
    });
    expect(deleteSession).not.toHaveBeenCalled();
  });

  it("deletes when the human accepts", async () => {
    const { result } = renderHook(() =>
      useSessionDelete(inputWith(async () => ({ action: "session.delete" }))),
    );
    await act(async () => {
      await result.current(SESSION as never);
    });
    expect(deleteSession).toHaveBeenCalledTimes(1);
  });

  it("tells the user the event log is destroyed", async () => {
    const confirmDestructive = vi.fn().mockResolvedValue(null);
    const { result } = renderHook(() =>
      useSessionDelete(inputWith(confirmDestructive)),
    );
    await act(async () => {
      await result.current(SESSION as never);
    });
    const request = confirmDestructive.mock.calls[0]?.[0] as { detail: string };
    expect(request.detail).toContain("event log");
  });
});
```

The third test is the one that guards A6: it asserts the _user-visible wording_ names the real loss,
by inspecting what the hook asks rather than what the file contains. Build the `inputWith` literal
against the real `UseSessionDeleteInput` type — the fields above are from the current interface, and
the `as unknown as` cast is there so an added field doesn't fail the test for the wrong reason. If a
required field is missing at runtime, add it.

- [ ] **Step 4: Run it**

```bash
pnpm -F @f-mark/renderer exec vitest run src/panels/sessions
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/renderer/src/panels/sessions
git commit -m "fix(sessions): say that delete destroys the event log

The dialog reassured the user that project files survive while staying
silent about the session's entire event history, which is what delete
actually removes."
```

---

### Task 7: Confirm before reverting or deleting a file (B1)

**Files:**

- Modify: `packages/renderer/src/panels/fileViewer/diff/hunkActionsBar/useHunkActionsBarController.ts:42-77`
- Modify: `packages/renderer/src/panels/fileViewer/diff/hunkActionsBar/model.ts:26-31`
- Test: `packages/renderer/src/panels/fileViewer/diff/hunkActionsBar/model.test.ts` (create)

**Interfaces:**

- Consumes: `useConfirmDestructive` from Task 2
- Produces: `hunkActionLabel(status: GitFileStatus): string` now returns `"Delete hunk"` for
  untracked/added; `runRevert` unchanged in signature

`fileStatus: GitFileStatus` is already on `HunkActionsBarProps:31`, so no new prop is needed.

- [ ] **Step 1: Make the hunk label honest**

In `model.ts`, `hunkActionLabel` currently returns `"Revert hunk"` for an untracked file — but
reverse-applying that file's synthetic whole-file hunk removes all of its content. Replace lines 26-31:

```ts
/** Per-hunk revert label by status (should-fix 7 / X3). For untracked/added
    files the only hunk is synthetic and whole-file, so reverting it deletes
    the file's content — say so. */
export function hunkActionLabel(status: GitFileStatus): string {
  if (
    status === NO_LOOSE_STRING_VALUES.deleted ||
    status === NO_LOOSE_STRING_VALUES.binaryDeleted
  ) {
    return "Restore hunk";
  }
  if (
    status === NO_LOOSE_STRING_VALUES.untracked ||
    status === NO_LOOSE_STRING_VALUES.added ||
    status === NO_LOOSE_STRING_VALUES.binaryUntracked ||
    status === NO_LOOSE_STRING_VALUES.binaryAdded
  ) {
    return "Delete hunk";
  }
  return "Revert hunk";
}
```

- [ ] **Step 2: Add a describing helper**

Append to `model.ts`:

```ts
/** What the user loses, for the confirmation dialog. Untracked content is not
    in git, so nothing can restore it. */
export function revertConfirmDetail(status: GitFileStatus): string {
  return status === NO_LOOSE_STRING_VALUES.untracked ||
    status === NO_LOOSE_STRING_VALUES.binaryUntracked
    ? "This file is untracked, so git cannot restore it. This is permanent."
    : "Discards your uncommitted changes to this file.";
}
```

- [ ] **Step 3: Confirm inside runRevert**

In `useHunkActionsBarController.ts`, add the imports:

```ts
import { useConfirmDestructive } from "../../../../confirm/index.js";
import {
  fileActionLabel,
  hunkDiffText,
  hunkLineRange,
  hunkSnippet,
  revertConfirmDetail,
} from "./model.js";
```

Destructure `fileStatus` alongside the other props, add `const confirmDestructive =
useConfirmDestructive();`, and insert the gate at the top of `runRevert` — before `setBusy(true)`:

```ts
if (busy) return;
const intent = await confirmDestructive({
  action: "git.revert",
  title: `${fileActionLabel(fileStatus)} — ${relPath}?`,
  detail: revertConfirmDetail(fileStatus),
});
if (intent === null) return;
setBusy(true);
```

Add `confirmDestructive` and `fileStatus` to the `useCallback` dependency array.

- [ ] **Step 4: Typecheck**

```bash
pnpm -F @f-mark/renderer build
```

Expected: PASS.

- [ ] **Step 5: Write the tests**

Create `packages/renderer/src/panels/fileViewer/diff/hunkActionsBar/model.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { fileActionLabel, hunkActionLabel, revertConfirmDetail } from "./model";

describe("hunkActionLabel", () => {
  it("says Delete for an untracked file", () => {
    expect(hunkActionLabel("untracked")).toBe("Delete hunk");
  });

  it("says Restore for a deleted file", () => {
    expect(hunkActionLabel("deleted")).toBe("Restore hunk");
  });

  it("says Revert for a modified file", () => {
    expect(hunkActionLabel("modified")).toBe("Revert hunk");
  });
});

describe("fileActionLabel", () => {
  it("agrees with hunkActionLabel about untracked files", () => {
    expect(fileActionLabel("untracked")).toBe("Delete file");
  });
});

describe("revertConfirmDetail", () => {
  it("warns that untracked content is unrecoverable", () => {
    expect(revertConfirmDetail("untracked")).toContain("permanent");
  });

  it("does not over-warn for a tracked file", () => {
    expect(revertConfirmDetail("modified")).not.toContain("permanent");
  });
});
```

If `"modified"` is not a member of `GitFileStatus`, run
`grep -n "GitFileStatus" packages/shared/src/git.ts` and substitute the real modified-file variant.

- [ ] **Step 6: Run them**

```bash
pnpm -F @f-mark/renderer exec vitest run src/panels/fileViewer/diff/hunkActionsBar
```

Expected: 6 passed.

- [ ] **Step 7: Check the kernel side is no worse**

```bash
pnpm -F f-mark exec vitest run tests/git/revert.test.ts
```

`tests/git/revert.test.ts` is in the recorded baseline as failing. Confirm the failure count is
**unchanged** — this task touches no kernel code, so any movement means something unexpected happened.

- [ ] **Step 8: Commit**

```bash
git add packages/renderer/src/panels/fileViewer/diff/hunkActionsBar
git commit -m "fix(diff): confirm before reverting, and name deletion honestly

Reverting an untracked file deleted it with no prompt and no way back --
not in HEAD, the index, the object store or a stash. The per-hunk control
also said 'Revert hunk' while reverse-applying a synthetic whole-file hunk."
```

---

### Task 8: Cascade count comes from the server (H2)

**Files:**

- Modify: `packages/kernel/src/routes/todos.ts`
- Modify: `packages/renderer/src/api/client.ts`
- Modify: `packages/renderer/src/cards/todoItem/useTodoItemController.ts:72-79`
- Test: `packages/kernel/tests/routes/todoDescendants.test.ts` (create)

**Interfaces:**

- Consumes: `useConfirmDestructive` from Task 2
- Produces:
  - `GET /sessions/:id/todos/:todoId/descendants` → `{ descendants: string[] }`
  - `client.todoDescendants(sessionId, todoId, scope): Promise<string[]>`

The client currently re-derives the cascade from whatever `allEvents` it holds, and
`ProseInlineBlock.tsx:102,110` hands it `[event]` — so an embedded card always computes zero and shows
no dialog, while `writeTodoEvent` (`services/events.ts:773-786`) cascades anyway using
`findDescendants` over the full corpus. One authority, one number.

- [ ] **Step 1: Add the preflight route**

In `packages/kernel/src/routes/todos.ts`, register alongside the existing todo routes. Match the
surrounding handlers' scope-resolution and error style exactly:

```ts
app.get<{ Params: { id: string; todoId: string } }>(
  "/sessions/:id/todos/:todoId/descendants",
  async (req) => {
    const events = await readEvents(paths, req.params.id, { kinds: ["todo"] });
    const todoEvents = events.filter(
      (e): e is TodoEventRecord => e.kind === "todo",
    );
    const snapshot = buildTodoSnapshot(todoEvents);
    const descendants = findDescendants(snapshot, req.params.todoId);
    return { descendants: descendants.map((entry) => entry.id) };
  },
);
```

Import `buildTodoSnapshot` and `findDescendants` from the same module `writeTodoEvent` uses, so both
paths compute descendants with one function. If `TodoSnapshotEntry` exposes the id under a different
property, use that — verify with
`grep -n "interface TodoSnapshotEntry" -A 8 packages/kernel/src/services/events.ts`.

- [ ] **Step 2: Add the client method**

In `packages/renderer/src/api/client.ts`, next to the other todo methods:

```ts
  async todoDescendants(
    sessionId: string,
    todoId: string,
    scope: RootScope,
  ): Promise<string[]> {
    const res = await this.get<{ descendants: string[] }>(
      `/sessions/${sessionId}/todos/${todoId}/descendants`,
      scope,
    );
    return res.descendants;
  }
```

Match the file's existing request helper and scope-passing convention rather than inventing one — read
a neighbouring method first.

- [ ] **Step 3: Use the server's number in the confirmation**

In `useTodoItemController.ts`, replace the locally-derived descendant count in the remove handler with
a call to `todoDescendants`, then confirm:

```ts
const remove = async (): Promise<void> => {
  const descendants = await client.todoDescendants(sessionId, todo.id, scope);
  const intent = await confirmDestructive({
    action: "todo.remove",
    title:
      descendants.length === 0
        ? "Remove this task?"
        : `Remove this task and ${descendants.length} ${descendants.length === 1 ? "subtask" : "subtasks"}?`,
    detail: "Removed tasks stay in the event log but leave the tree.",
  });
  if (intent === null) return;
  await postRemove();
};
```

Keep `TodoConfirmRemove.tsx` for the inline presentation if the surrounding component renders it —
the change that matters is where `descendants` comes from.

- [ ] **Step 4: Write the kernel test**

Create `packages/kernel/tests/routes/todoDescendants.test.ts`, following the helper conventions in
`tests/routes/sessions/helpers.ts`:

```ts
import { describe, it, expect } from "vitest";
import { withTempProject } from "../helpers/tempdir";

describe("GET /sessions/:id/todos/:todoId/descendants", () => {
  it("returns the children the kernel would cascade", async () => {
    await withTempProject(async (ctx) => {
      const parent = await ctx.postTodo({ id: "p", title: "parent" });
      await ctx.postTodo({ id: "c", title: "child", parent_id: "p" });
      const res = await ctx.get(
        `/sessions/${ctx.sessionId}/todos/p/descendants`,
      );
      expect(res.json().descendants).toEqual(["c"]);
      void parent;
    });
  });

  it("returns an empty list for a leaf", async () => {
    await withTempProject(async (ctx) => {
      await ctx.postTodo({ id: "solo", title: "solo" });
      const res = await ctx.get(
        `/sessions/${ctx.sessionId}/todos/solo/descendants`,
      );
      expect(res.json().descendants).toEqual([]);
    });
  });
});
```

Read `tests/routes/sessions/helpers.ts` first and use its real fixture API — the names above are
illustrative of shape, and the helper's actual signatures win.

- [ ] **Step 5: Run both sides**

```bash
pnpm -F f-mark exec vitest run tests/routes/todoDescendants.test.ts
pnpm -F @f-mark/renderer build
```

Expected: 2 passed; renderer typecheck green.

- [ ] **Step 6: Commit**

```bash
git add packages/kernel/src/routes/todos.ts packages/kernel/tests/routes/todoDescendants.test.ts packages/renderer/src
git commit -m "fix(todos): take the cascade count from the server that cascades

An embedded todo card was handed allEvents=[event], so it always computed
zero descendants and skipped the confirmation while the kernel deleted the
children anyway. The blast radius now comes from the authority that applies
it."
```

---

### Task 9: Confirm custom runtime removal (M2)

**Files:**

- Modify: `packages/renderer/src/modals/settings/runtimes/RuntimeTable.tsx:144`
- Test: `packages/renderer/src/modals/settings/runtimes/RuntimeTable.test.tsx` (create)

**Interfaces:**

- Consumes: `useConfirmDestructive` from Task 2
- Produces: nothing consumed downstream

Built-in runtimes are correctly non-removable already. Custom removal is recoverable via one `PUT`, so
this is the mildest item in the plan — but removing a runtime that backs a live agent is currently
unguarded.

- [ ] **Step 1: Confirm before removing**

Add `const confirmDestructive = useConfirmDestructive();` and gate the remove handler:

```ts
const intent = await confirmDestructive({
  action: "runtime.remove",
  title: `Remove the "${runtime.id}" runtime?`,
  detail:
    "Agents already running keep going. New launches with this runtime will fail until you re-register it.",
});
if (intent === null) return;
```

- [ ] **Step 2: Typecheck**

```bash
pnpm -F @f-mark/renderer build
```

Expected: PASS.

- [ ] **Step 3: Write the test**

Create `packages/renderer/src/modals/settings/runtimes/RuntimeTable.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from "@testing-library/react";

const removeRuntime = vi.fn().mockResolvedValue(undefined);

vi.mock("../../../api/client.js", () => ({
  createClient: () => ({ removeRuntime }),
}));

import { RuntimeTable } from "./RuntimeTable";

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("RuntimeTable remove", () => {
  it("keeps the runtime when the human cancels", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<RuntimeTable {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /remove/i }));
    await waitFor(() => {
      expect(removeRuntime).not.toHaveBeenCalled();
    });
  });

  it("removes the runtime when the human accepts", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<RuntimeTable {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /remove/i }));
    await waitFor(() => {
      expect(removeRuntime).toHaveBeenCalledTimes(1);
    });
  });

  it("does not offer removal for a built-in runtime", () => {
    render(<RuntimeTable {...builtInProps} />);
    expect(screen.getByRole("button", { name: /remove/i })).toBeDisabled();
  });
});
```

Three things to resolve against the real component, in this order: the mock path and method name for
removal (read `RuntimeTable.tsx` and mock whatever module it actually calls — `../../../api/client.js`
and `removeRuntime` are the expected names, not verified); `props` and `builtInProps` as minimal
literals with one custom and one built-in runtime; and the remove control's real accessible name.

The third test pins existing correct behaviour — built-ins are already non-removable
(`RuntimeTable.tsx:144`) — so a future change to the remove path cannot quietly enable it.

- [ ] **Step 4: Run the full renderer suite**

```bash
pnpm -F @f-mark/renderer test
```

Expected: PASS.

- [ ] **Step 5: Final full check against the baseline**

```bash
pnpm test 2>&1 | tail -8
```

Expected: kernel **31 failed / 1157 passed** or better, renderer green. **Any kernel count above 31 is a
regression you introduced** — the baseline exists so it cannot hide.

- [ ] **Step 6: Commit**

```bash
git add packages/renderer/src/modals/settings/runtimes
git commit -m "fix(settings): confirm before removing a custom runtime"
```

---

## Self-review

**Spec coverage** — every Cluster A item maps to a task: A1 → 2, A2 → 4, A3 → 8, A4 → 7, A5 → 3,
A6 → 6, H1 → 5, M2 → 9. Task 1 is infrastructure the remediation doc did not list; it is here because
every other task's verification gate is fictional without it.

**Type consistency** — `ConfirmedIntent` and `ConfirmRequest` are defined in Task 2 and used with the
same names and shapes in Tasks 5, 6, 7, 8, 9. `useConfirmDestructive` returns
`Promise<ConfirmedIntent | null>` everywhere; every call site checks `=== null`. `hunkActionLabel`,
`fileActionLabel` and `revertConfirmDetail` all take `GitFileStatus`.

**Test style, settled before execution.** An earlier draft of this plan specified source-text assertion
tests (`expect(source).not.toContain("goodbye")`) for Tasks 3, 5, 6 and 9. Those were replaced with
behavioural tests on Oran's decision, for two reasons: a reviewer would reasonably flag them as tests
that assert on source rather than behaviour, and — more importantly — Task 2's branded receipt already
makes "called `goodbye` without confirming" a _compile_ error, so a grep-for-the-import test re-checks
a guarantee the type system gives while still passing a refactor that keeps the import and breaks the
gate. The tests now assert what remains genuinely unproven: **that Cancel actually cancels.**

**Deliberate gaps, called out rather than papered over:**

- Tasks 8 and 9 give exact intent but their surrounding code was **not** read line-by-line during
  planning, unlike Tasks 1-7. Each carries an explicit instruction to read the neighbouring
  implementation and match it. Treat their code blocks as specifications of behaviour, not literal
  patches.
- Task 2 leaves the renderer build red until Task 5. That is intentional — the failure list _is_ the
  work queue — but Tasks 2-5 must land as one PR.
- Presentation stays `window.confirm`. A real `alertdialog` per
  [WAI-ARIA APG](https://www.w3.org/WAI/ARIA/apg/patterns/alertdialog/) belongs with Cluster D's focus
  trap work, and lands behind this same hook with no call-site changes.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-30-destructive-action-contract.md`.

Remaining clusters (B through L) are separate plans, written on demand in the remediation doc's
sequence.
