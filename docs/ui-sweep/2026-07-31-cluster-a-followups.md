# Cluster A — follow-ups after `feature/destructive-action-contract`

Cluster A of `2026-07-30-remediation.md` is implemented: **B1, B2, H1, H2, M2 and A6 are closed.**
These are the items the work surfaced but deliberately did not fix. Each says why.

---

## 1. `killTerminal` destroys a tmux session with no confirmation — **highest priority**

`packages/renderer/src/panels/right/terminal/RegularTerminals.tsx:64-71` →
`useRightTerminalController.ts:146-167`

A tab `×` labelled *"Kill terminal {label}"* calls `apiClient.killTerminal(session)` immediately,
destroying the tmux session and its scrollback. Unrecoverable, no dialog.

**This is structurally identical to B2** — a destructive action behind a tab-close affordance — sitting
in the *sibling component* to the one Task 3 fixed, rendered in the same panel. The UI sweep did not
catch it and neither did the remediation plan; the final whole-branch review found it.

The fix is small: route it through `useConfirmDestructive` like every other destructive control on the
branch. It is out of scope only because the plan's scope was written before anyone knew it existed.

## 2. Un-skip Task 9's two tests when the `AgentKindArt` collision is fixed

`packages/renderer/tests/modals/settings/runtimesPanel.test.tsx` — two `it.skip` cases with an inline
reason.

They are real behavioural tests (cancel keeps the runtime, accept removes it) that cannot run because
`RuntimeTable.tsx:84` renders `AgentKindArt`, which is `undefined` at runtime. See item 3.

**Grep for `it.skip` in that file after the collision lands.** This is the one follow-up that depends on
a future reader noticing a marker.

## 3. The `AgentKindArt` case-collision — not ours, but it blocks real work

Two tracked files differ only in case:

```
packages/renderer/src/components/participantAvatar/agentKindArt.ts    → agentKindArtLines, agentKindArtTones
packages/renderer/src/components/participantAvatar/AgentKindArt.tsx   → AgentKindArt
```

On macOS's case-insensitive filesystem, `import { AgentKindArt } from ".../AgentKindArt.js"` resolves to
the **lowercase** module, which has no such export. Introduced by `e6207d4`.

Cost, measured on this branch's base: the renderer build fails with 4 errors, and **42 renderer test
files (282 tests) are red.** A fix was in progress uncommitted in the main working tree during this
work — the rename `agentKindArt.ts` → `agentKindArtPresets.ts` — and was deliberately left alone to
avoid conflicting with it.

**Almost certainly macOS-only.** On Linux's case-sensitive filesystem both files coexist and imports
resolve correctly, which is why CI never caught it. If it should stay caught, that needs a
case-collision check in CI — a Linux runner will not find it.

## 4. Cmd/Backspace removes a todo with no confirmation

`packages/renderer/src/cards/todoItem/keyboard.ts:69-81` calls the raw `onRemove` prop, bypassing the
controller's `remove()` where the confirmation lives.

Verified genuinely pre-existing: the old `TodoConfirmRemove` gate lived in the same place, and the
keyboard path skipped it identically. Mitigated by todo removal being a **soft delete** — the kernel
writes a `removed` event and nothing leaves the append-only log.

Worth stating plainly: because of this path, it is not true that F-Mark makes it *impossible* to destroy
something without confirming.

## 5. Kernel TypeScript was ungated in CI until this branch

`.github/workflows/ci.yml` used `pnpm -F kernel`, which matches no package (it is named `f-mark`) and
**exits 0**. Both kernel build steps passed while doing nothing.

Fixed in Task 1, and the kernel turned out to be clean. But note the kernel's `test` script is bare
`vitest run` — no lint, no `tsc` — where the renderer's runs both. The kernel build step is now the only
thing typechecking the kernel.

## 6. Confirmation is type-enforced for exactly one operation

Only `goodbye` takes a `ConfirmedIntent`. `deleteSession`, `removeRuntime`, `revertHunkChange`, `clear`
and the todo `removed` write all confirm by **convention** (`if (intent === null) return;`) — the
discipline the branch's own thesis says does not scale.

That was the plan's declared scope and is a legitimate stopping point. But do not describe the contract
as universal: **the compiler protects one of six destructive operations.** Extending the receipt to the
other five is the natural next increment.

## 7. Deferred minors (ship-safe, listed for completeness)

- `await confirmDestructive(...)` sits outside the surrounding try/catch at every call site. Harmless
  today — `window.confirm` is synchronous and cannot reject — but **fix it when Cluster D swaps in a
  real `alertdialog`**, which can.
- `ConfirmEntry` in `requestNonces.ts` was not renamed to `RequestNonceEntry`.
- `confirmAndRemove` in `RuntimesPanel.tsx:53` is a `function`, not a `const` arrow.
- `ParticipantStrip` uses `agent.name` where the other three agent surfaces use `agent.display_name`.
- `pages/fileTreePage/useProjectPromotion.ts:23` is the last bare `window.confirm` in renderer `src/`.
  Correctly left — switching the active project destroys nothing — but it reads like a half-finished
  migration.
- The `AgentActionMenu` dead-code cluster still contains a bespoke inline confirm, now stacked under the
  primitive's dialog. Unreachable (zero importers). When Cluster K removes it, remove **both**.

---

## Process lessons worth keeping

**Scoped test paths must cover `tests/` as well as `src/`.** This repo's vitest config has two roots.
Every task dispatch named only `src/...`, and `tests/panels/hunk-actions-bar.test.tsx` stayed red for
several tasks as a result.

**Compare the failing-FILE SET, never the failure count.** The count drifts legitimately as tasks add
tests — which is exactly how that regression hid. Diffing the file list against a recorded baseline
found it immediately.

**A green scoped run is not a green branch.** Both were true simultaneously for several commits here.
