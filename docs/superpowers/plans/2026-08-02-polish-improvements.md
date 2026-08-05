# Polish Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the twelve improvements from the polish review that attach to files which exist in
`src/` today — eight of the nine starred — without waiting on any new screen.

**Architecture:** Every task reuses machinery already in the renderer rather than inventing a
parallel system: `useElapsed` (from the Aurora foundation plan), `copyToClipboard`, the
`ANCHOR_FLASH` transient-class pattern, and existing CSS keyframes. No new dependencies, no new
state containers, no changes to the event aggregator.

**Tech Stack:** React 18 · Vite · Zustand · vanilla CSS custom properties · Vitest 2 · pnpm 10.33.2

---

## Read this before Task 1

**Depends on `docs/superpowers/plans/2026-08-02-aurora-foundation.md`.** That plan must be merged
first: Task 1 here imports `useElapsed` from `src/hooks/useElapsed.ts`, which the foundation plan
creates in its Task 6. If `src/hooks/useElapsed.ts` does not exist, **stop and report**.

**All gotchas from the foundation plan still apply.** Re-read its "Gotchas" section. The two that
bite hardest here:

1. **Node 25 makes ~32 renderer test FILES red before you touch anything.** Diff the failing
   **FILE SET** against `docs/ui-sweep/2026-08-02-test-baseline.json`, never the count.
2. **`pnpm -F @f-mark/shared build` before any test run**, or 73 kernel files fail to collect.

**Do not push and do not open a PR.** Never `git stash` — the stack is shared across worktrees.

### What was verified in `src/` on 2026-08-02

The polish review audited the **design labs**, not the product. Four of its findings do not apply
to the real app, and one applies only in half. Verified by reading source:

| Review claim | Reality in `src/` |
|---|---|
| "`.empty` defined but never rendered" | **False.** `FeedEmptyState.tsx` and `TabEmptyState.tsx` both ship; `.empty-state` is used at `shell.css:1569` and `cards.css:2583`. No task. |
| "'Always' vs 'Allow always' inconsistent" | **False.** `src/` already says "Allow always" — asserted by `AccessRequestCard.test.tsx:247`. No task. |
| "Approval buttons give no confirmation" | **Half true.** `AccessRequestCard.tsx:172` already has `busy` state and disables via `canRespond`; a `.approval-status` chip already renders. What is missing is the *rich* resolved label — `statusLabel` at `:69-75` returns the raw status string. Task 2 fixes only that half. |
| "No busy state on Spawn / Send" | **True.** Zero `busy`/`disabled` in `hooks/useAgentSpawn.tsx` or `shell/Compose.tsx`. Task 3. |

### Out of scope — blocked on screens that do not exist

Do not attempt these; they have no target file. There is **no sparkline, no toast, no dashboard,
and no agent screen** anywhere in `src/` (verified by grep, zero matches):

sparkline tinted by outcome · sparkline draw-in · toast countdown · dashboard state crossfade ·
"Doing now" elapsed time · "last ping" vs "pane activity" tooltip · "Recent" rows clickable ·
the conversation/terminal segmented control.

---

## Global Constraints

- **No new dependencies.** None.
- **Do not rename any CSS custom property.** 5,751 `var()` call sites depend on current names.
- **Do not modify** `state/aggregate/EventAggregator.ts` or `feed/projectFeed.ts`.
- **One meaning per channel:** ink level = hierarchy · `--agent`/`--ledger` = an agent is working ·
  `--alarm` = destruction/blocked · participant hue = who · tool hue = what kind.
- **Quality floor on every surface touched:** `:focus-visible` ring instant, never transitioned ·
  `:active` and `:disabled` styled, `cursor: not-allowed` on disabled · `prefers-reduced-motion`
  honoured with a near-zero reset, never a duration token · `overflow-x: clip`, never `hidden`, on
  any block that does not already scroll on Y · no horizontal scroll 320–1920px · WCAG AA on text.
- **The `quality-floor.test.ts` guard from the foundation plan must stay green.** Every task below
  adds motion; that test is what stops the floor drifting.
- **Commit after every task.** Imperative mood, no emojis, no "Generated with" footer.

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `src/shell/topBar/TopBarActions.tsx` | live "last event Xs ago" | modify |
| `src/cards/AccessRequestCard.tsx` | rich resolved label | modify |
| `src/hooks/useAgentSpawn.tsx` | spawn busy state | modify |
| ~~`src/shell/Compose.tsx`~~ | **2-line re-export stub — real file is `src/compose/Compose.tsx`** | corrected |
| `src/popovers/Popover.tsx` | animated close — shared by 8 popovers | modify |
| `AgentMentionPickerView.tsx` | animated close — the other `popover-enter` consumer | modify |
| ~~`src/cards/toolboxAccordion.tsx`~~ | **a context, not markup — real target is `src/cards/ToolUseCard.tsx:67`** | corrected |
| `src/panels/right/RightFiles.tsx` | copy-on-click | modify |
| `src/panels/right/agents/` | rename pencil on focus | modify |
| `src/shell/topBar/ViewModeToggle.tsx` | sliding indicator | modify |
| `src/panels/right/agents/RightAgentDetails.tsx` | context meter transition | modify |
| `src/components/participantStrip/AgentChipEditorPopover.tsx` | chevron rotation | modify |
| `src/cards/FlowCard.tsx` | diagnosed-node pulse (NOT `cards/flow/`) | modify |

---

## Task 1: Live "last event Xs ago" in the top bar

The top bar states when the app last heard from the kernel. Rendered once, it silently stops being
true — the same defect as the frozen wait timer, on the one indicator that tells you whether the
whole view is stale.

**Files:**
- Modify: `packages/renderer/src/shell/topBar/TopBarActions.tsx`
- Test: `packages/renderer/tests/lastEventAge.test.ts`

**Interfaces:**
- Consumes: `useElapsed(since: string | number): string` from `src/hooks/useElapsed.js` — created
  by the Aurora foundation plan, Task 6.
- Produces: no new exports.

- [ ] **Step 1: Confirm the dependency and find the timestamp**

```bash
ls packages/renderer/src/hooks/useElapsed.ts
grep -n "export" packages/renderer/src/hooks/useElapsed.ts
grep -rn "events\[" packages/renderer/src/shell/topBar/TopBarActions.tsx
grep -rn "created_at\|ts\b" packages/renderer/src/types.ts | head -5
```

If `useElapsed.ts` is missing, **stop** — the foundation plan has not been merged.

Note the exact timestamp field the newest event carries. Use that field name verbatim below.

- [ ] **Step 2: Render the live age**

In `TopBarActions.tsx`, derive the newest event's timestamp from the store and render:

```tsx
/* The freshness indicator's whole job is to say how current this view is.
   Rendered once it becomes a lie within seconds, which is worse than showing
   nothing - a stale number reads as a fresh one. useElapsed re-renders it
   every second. */
const lastEventAge = useElapsed(newestEventTs);
```

Render it as `last event {lastEventAge} ago`, with `aria-live="off"` — this updates every second
and must never be announced.

- [ ] **Step 3: Write the test**

Create `packages/renderer/tests/lastEventAge.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { formatElapsed } from "../src/hooks/useElapsed.js";

/* The top bar reuses the same formatter as the approval wait timer, so the two
   never disagree about what "3m 41s" means. */
describe("top-bar freshness reuses formatElapsed", () => {
  test("sub-minute reads in seconds", () => {
    expect(formatElapsed(42_000)).toBe("42s");
  });
  test("clamps a clock skew into the past to zero", () => {
    expect(formatElapsed(-1_000)).toBe("0s");
  });
});
```

- [ ] **Step 4: Verify**

```bash
pnpm -F @f-mark/shared build
pnpm -F @f-mark/renderer test --run tests/lastEventAge.test.ts
pnpm -F @f-mark/renderer build
```

Expected: 2 passed, build exits 0.

- [ ] **Step 5: Commit**

```bash
git add packages/renderer/src/shell/topBar/TopBarActions.tsx packages/renderer/tests/lastEventAge.test.ts
git commit -m "feat(topbar): live last-event age

The freshness indicator rendered once and froze. A stale freshness number is
worse than none - it reads as fresh. Reuses formatElapsed so the top bar and
the approval wait timer never disagree about what 3m 41s means.

aria-live is off: this changes every second and must never be announced."
```

---

## Task 2: Rich approval confirmation

Half of this is already built — `busy` state, disabled buttons, and a `.approval-status` chip all
ship. The gap is `statusLabel` at `AccessRequestCard.tsx:69-75`, which returns the raw status
string, so a resolved request reads `approved` rather than saying *what* was allowed and *when*.

**Files:**
- Modify: `packages/renderer/src/cards/AccessRequestCard.tsx`
- Test: `packages/renderer/tests/approvalStatusLabel.test.ts`

**Interfaces:**
- Produces: `formatApprovalStatus(status: string, scope: string | null, at: string | null): string`
  exported from `AccessRequestCard.tsx` for testing.

- [ ] **Step 1: Read the current shape before writing**

```bash
sed -n '60,80p' packages/renderer/src/cards/AccessRequestCard.tsx
grep -n "option_id\|scope\|decided_at\|ts" packages/renderer/src/cards/AccessRequestCard.tsx | head
```

Confirm which fields the `AccessResponsePayload` actually carries. **Use only fields that exist** —
if there is no decision timestamp on the response, fall back to the event's own timestamp and say
so in the commit message.

- [ ] **Step 2: Write the failing test**

Create `packages/renderer/tests/approvalStatusLabel.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { formatApprovalStatus } from "../src/cards/AccessRequestCard.js";

describe("formatApprovalStatus", () => {
  test("open requests stay bare", () => {
    expect(formatApprovalStatus("open", null, null)).toBe("open");
  });
  test("an approval names its scope and time", () => {
    expect(formatApprovalStatus("approved", "once", "2026-08-02T14:04:00Z")).toMatch(/once/);
    expect(formatApprovalStatus("approved", "once", "2026-08-02T14:04:00Z")).toMatch(/14:04/);
  });
  test("a denial does not claim a scope", () => {
    expect(formatApprovalStatus("denied", "once", "2026-08-02T14:04:00Z")).not.toMatch(/once/);
  });
  test("missing time degrades to scope only", () => {
    expect(formatApprovalStatus("approved", "always", null)).toMatch(/always/);
  });
});
```

- [ ] **Step 3: Run it — must fail**

```bash
pnpm -F @f-mark/shared build
pnpm -F @f-mark/renderer test --run tests/approvalStatusLabel.test.ts
```

Expected: FAIL — `formatApprovalStatus` is not exported.

- [ ] **Step 4: Implement and wire it**

Replace `statusLabel` with an exported `formatApprovalStatus`, and have the `.approval-status` chip
render it. Keep `data-status` as the **raw** status — it is a styling hook and existing CSS and
tests may select on it.

```tsx
/* A resolved approval previously read "approved", which does not say what was
   allowed or when. Denials deliberately omit the scope: "denied once" reads as
   though something was permitted. */
export function formatApprovalStatus(
  status: string,
  scope: string | null,
  at: string | null,
): string {
  if (status !== "approved") return status;
  const time = at === null ? null : new Date(at).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  const parts = ["allowed", scope, time].filter((p): p is string => p !== null && p !== "");
  return parts.join(" · ");
}
```

- [ ] **Step 5: Verify the existing card tests still pass**

```bash
pnpm -F @f-mark/renderer test --run tests/approvalStatusLabel.test.ts
pnpm -F @f-mark/renderer test --run src/cards/AccessRequestCard.test.tsx
pnpm -F @f-mark/renderer build
```

Expected: new test passes; **the existing `AccessRequestCard.test.tsx` must still pass.** If it
asserts on the old bare status text, that assertion is now wrong — update it and say so in the
commit. If it asserts on `data-status`, it must be untouched.

- [ ] **Step 6: Commit**

```bash
git add packages/renderer/src/cards/AccessRequestCard.tsx packages/renderer/tests/approvalStatusLabel.test.ts
git commit -m "feat(cards): approvals say what was allowed and when

The busy state and disabled buttons were already wired; the gap was
statusLabel, which returned the raw status so a resolved request read
'approved' without saying what was permitted or when.

Denials omit the scope on purpose - 'denied once' reads as though something
was allowed. data-status keeps the raw value because it is a styling hook."
```

---

## Task 3: Busy states on Spawn and Send

Verified absent: zero `busy`/`disabled` in `useAgentSpawn.tsx` or `Compose.tsx`. Both start work
that is hard to undo, and clicking twice currently looks identical to clicking once.

**Files:**
- Modify: `packages/renderer/src/hooks/useAgentSpawn.tsx`
- Modify: `packages/renderer/src/shell/Compose.tsx`
- Modify: `packages/renderer/src/shell/shell.css`

**Interfaces:**
- Produces: `useAgentSpawn` gains a `busy: boolean` in its returned object. **Additive only** —
  do not change any existing field, other call sites depend on them.

- [ ] **Step 1: Read both call sites first**

```bash
grep -n "return\|async function\|await" packages/renderer/src/hooks/useAgentSpawn.tsx | head -20
grep -rn "useAgentSpawn" packages/renderer/src --include="*.tsx"
grep -n "onSubmit\|async\|send" packages/renderer/src/shell/Compose.tsx | head -15
```

List every consumer of `useAgentSpawn` before changing its return shape.

- [ ] **Step 2: Add the guard in both**

Follow the pattern `AccessRequestCard.tsx:172-212` already establishes — it is the reference
implementation in this codebase:

```tsx
const [busy, setBusy] = useState(false);

async function submit(): Promise<void> {
  if (busy) return;          /* re-entrancy guard, not just a visual state */
  setBusy(true);
  try {
    await doTheThing();
  } finally {
    setBusy(false);          /* finally, so a thrown error cannot wedge it */
  }
}
```

Disable the button with `disabled={busy}` and set `aria-busy={busy}`.

- [ ] **Step 3: Style the disabled state**

Append to `shell.css`:

```css
/* The floor requires a styled :disabled with not-allowed. Opacity alone reads
   as "dim" rather than "not now". */
.compose-send:disabled,
.agent-spawn-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
```

Use the real class names from the two files — check them, do not assume these.

- [ ] **Step 4: Verify no consumer broke**

```bash
pnpm -F @f-mark/shared build && pnpm -F @f-mark/renderer build
pnpm -F @f-mark/renderer test --run --reporter=json --outputFile=/tmp/polish-now.json 2>&1 | tail -3
node -e '
const base=require("./docs/ui-sweep/2026-08-02-test-baseline.json");
const now=require("/tmp/polish-now.json");
const f=[...new Set(now.testResults.filter(t=>t.status!=="passed").map(t=>t.name))].sort();
const added=f.filter(x=>!base.includes(x));
console.log("NEW failing files:",added.length); added.forEach(x=>console.log("  ",x));
'
```

Expected: build exits 0, `NEW failing files: 0`.

- [ ] **Step 5: Commit**

```bash
git add packages/renderer/src/hooks/useAgentSpawn.tsx packages/renderer/src/shell/Compose.tsx packages/renderer/src/shell/shell.css
git commit -m "feat(shell): busy states on spawn and send

Both start work that is hard to undo, and clicking twice looked identical to
clicking once. The guard is re-entrancy first and visual second: an early
return on busy, and setBusy(false) in a finally so a thrown error cannot
wedge the control permanently.

Follows the pattern AccessRequestCard already establishes. busy is added to
useAgentSpawn's return, never replacing an existing field."
```

---

## Task 4: Animate menus closed

Menus pop in with a keyframe and are removed instantly. Animating in but not out is the clearest
"assembled, not made" tell in the app.

**Files:**
- Modify: `packages/renderer/src/popovers/Popover.tsx` — the shared wrapper. EIGHT popovers
  route through it (AgentPopover, SkillsPopover, ComposeSettingsPopover, CreateTodoPopoverView,
  LogFilterPopover, PresetsPopoverView, AgentChipEditorPopover, ForkSessionPopoverView), so one
  fix covers all of them.
- Modify: the `.agent-mention-popover` owner (`AgentMentionPickerView.tsx`, styled at
  `shell/shell.css:5328`) — the only other `popover-enter` consumer.

**NOT** `PathSwitcherMenu.tsx` or `TodoAssigneeControl.tsx`. Verified 2026-08-02:
`.path-switcher-menu` (`shell.css:1719`) and `.todo-assignee-menu` (`cards.css:2072`) have **no
`animation` property at all** — they have no motion, so there is no asymmetry to fix. Adding
motion there would be inventing work the finding never described. The finding was "animates in
but not out", which is true only of the two `popover-enter` consumers above.
- Modify: the CSS file that owns each menu's open keyframe

### Premise correction — verified in `src/` on 2026-08-02

The review said menus "pop in with a keyframe and are `.remove()`d instantly". That describes
the **design lab's vanilla-JS implementation**. There is no `closeMenus()` and no `.remove()`
anywhere in `src/` — this is React, and menus vanish because they **unmount**.

The asymmetry is still real, just by a different mechanism:

| Fact | Where |
|---|---|
| `@keyframes popover-enter` exists | `popovers/popovers.css:8` |
| applied with `backwards` fill | `popovers/popovers.css:38`, `shell/shell.css:5328` |
| any exit keyframe | **none anywhere** |

So popovers animate in and disappear instantly on unmount. The fix is therefore **not** a
class swap before removal — it is keeping the element mounted for the duration of the exit,
then unmounting. That is a React state change, not a DOM operation.

- [ ] **Step 1: Find every consumer of `popover-enter`**

```bash
grep -rn "popover-enter" packages/renderer/src --include="*.css"
```

Note the duration token it uses on open. The exit must be shorter (~70%), and must live in the
same file as the enter keyframe so the pair is readable together.

- [ ] **Step 2: Add a closing state**

Keep the element mounted for the duration of the exit, then unmount:

```tsx
/* Exit is deliberately shorter than entry (~70%): a slow dismissal feels
   unresponsive, while a slow entrance feels considered. */
const [closing, setClosing] = useState(false);
const close = useCallback((): void => {
  setClosing(true);
  window.setTimeout(() => {
    setClosing(false);
    setOpen(false);
  }, 120);
}, [setOpen]);
```

- [ ] **Step 3: Mirror the keyframe**

```css
.menu.is-closing {
  animation: menu-pop-out 120ms var(--ease-out-quart) forwards;
  pointer-events: none;      /* no clicks land on a menu that is leaving */
}
@keyframes menu-pop-out {
  to { opacity: 0; transform: translateY(-4px) scale(0.98); }
}
@media (prefers-reduced-motion: reduce) {
  .menu.is-closing { animation-duration: 0.01ms; }
}
```

The reduced-motion reset must be a **near-zero literal**, never a `var()` duration token — the
quality-floor guard asserts exactly this.

- [ ] **Step 4: Verify the guard still passes**

```bash
pnpm -F @f-mark/shared build
pnpm -F @f-mark/renderer test --run tests/quality-floor.test.ts
pnpm -F @f-mark/renderer build
```

Expected: 3 passed, build exits 0.

- [ ] **Step 5: Commit**

```bash
git add packages/renderer/src/shell/pathSwitcher/PathSwitcherMenu.tsx packages/renderer/src/cards/todoItem/TodoAssigneeControl.tsx packages/renderer/src/shell/shell.css
git commit -m "feat(menus): animate closed, not just open

Menus popped in with a keyframe and were removed instantly. Animating in but
not out is the clearest assembled-not-made tell in the app.

Exit runs at ~70% of entry: a slow dismissal feels unresponsive where a slow
entrance feels considered. pointer-events go to none while leaving so a click
cannot land on a menu that is already gone."
```

---

## Task 5: Tool disclosure height transition

The chevron rotates and the content pops. `grid-template-rows: 0fr → 1fr` animates height without
measuring it.

**Files:**
- Modify: `packages/renderer/src/cards/toolboxAccordion.tsx`
- Modify: `packages/renderer/src/cards/cards.css`

### Premise corrections — verified in `src/` on 2026-08-02. Read before starting.

**Two things in the original finding are wrong.**

1. **`cards/toolboxAccordion.tsx` is NOT the target.** It is a React context that lifts
   open/closed state to the feed — no markup, no `aria-expanded`, no div, no button. Nothing
   to style there.

2. **The a11y half is ALREADY DONE.** The finding said the disclosure row "carries
   `aria-expanded` but is a bare div". That was fixed during the tool-argument task: the row is
   now `<div className="tool-head">` wrapping a real `<button className="tool-head-toggle">`
   that carries `aria-expanded` (`cards/toolUseCard/ToolUseHeader.tsx:145`). Do **not** add
   `role="button"` anywhere — that would reintroduce the nested-interactive defect that
   restructure removed.

**What is actually left is only the height transition, and there is a blocker the plan missed:**

`cards/ToolUseCard.tsx:67` renders the body as `{open ? (...) : null}` — the content is
**conditionally rendered**, so when closed there is no element in the DOM. `grid-template-rows:
0fr → 1fr` animates an element that is always present; it cannot animate one that does not
exist yet.

So this task necessarily includes restructuring the render: the wrapper must always be in the
DOM with the body inside it, and `open` must drive the grid rows rather than the presence of
the children.

**Consider the cost before you do it.** Always-rendering every collapsed tool body in an
append-only feed means mounting content for every tool call in the session. Check what the body
actually contains (`ToolUseCard.tsx:67` onward) and judge whether that is acceptable. If it
mounts something expensive, **stop and report** rather than trading a scroll-performance
regression for an animation — the feed is the densest surface in the app.

`cards/ArbitraryGroupCard.tsx:91` has the same `disclosure.shown ? " open" : ""` pattern for
toolboxes; note whether your approach generalises, but do not change it in this task.

- [ ] **Step 1: Read the real markup and judge the mount cost**

```bash
sed -n '50,80p' packages/renderer/src/cards/ToolUseCard.tsx
```

- [ ] **Step 2: Add the transition**

```css
/* grid-template-rows 0fr -> 1fr animates to the content's natural height with
   no measurement and no fixed max-height guess. The inner element MUST have
   min-height: 0 or the collapse does nothing. */
.tool-disclosure {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows var(--dur-fast) var(--ease-out-quart);
}
.tool-disclosure.is-open { grid-template-rows: 1fr; }
.tool-disclosure > * {
  min-height: 0;
  overflow: hidden;
}
@media (prefers-reduced-motion: reduce) {
  .tool-disclosure { transition-duration: 0.01ms; }
}
```

- [ ] **Step 3: Also fix the role**

The disclosure row carries `aria-expanded` but is a plain `div`. Add `role="button"` and
`tabIndex={0}`, or convert it to a real `<button>` — prefer the real button if the surrounding
markup allows it.

- [ ] **Step 4: Verify**

```bash
pnpm -F @f-mark/shared build
pnpm -F @f-mark/renderer test --run tests/quality-floor.test.ts
pnpm -F @f-mark/renderer build
```

- [ ] **Step 5: Commit**

```bash
git add packages/renderer/src/cards/toolboxAccordion.tsx packages/renderer/src/cards/cards.css
git commit -m "feat(cards): animate tool disclosure height

The chevron rotated and the content popped. grid-template-rows 0fr to 1fr
animates to natural height with no measurement and no max-height guess; the
inner element needs min-height 0 or the collapse silently does nothing.

Also gives the row role=button - it carried aria-expanded as a bare div, so
it was operable but never announced as actionable."
```

---

## Task 6: Copy-on-click in the Files panel

`copyToClipboard` is proven at 8 call sites. Files is the panel most full of paths.

**Note:** the review said "Files **and Search**". There is no `RightSearch.tsx` — `search` is
declared in `tabMeta.tsx:46` but has no panel component. **Files only.**

**Files:**
- Modify: `packages/renderer/src/panels/right/RightFiles.tsx`
- Modify: `packages/renderer/src/panels/right/files/` (whichever file renders a row)

- [ ] **Step 1: Find the row component and the existing convention**

```bash
ls packages/renderer/src/panels/right/files/
grep -rn "copyToClipboard" packages/renderer/src/cards/ProseCard.tsx
```

`copyToClipboard(text: string): Promise<boolean>` — `ProseCard.tsx:54` calls it bare with `await`.
Match that exactly.

- [ ] **Step 2: Add the affordance**

Reuse the `.tool-arg-copy` class the Aurora foundation plan added in its Task 5 — **do not write a
second copy style.** If that class does not exist, the foundation plan has not been merged; stop.

Add a ~900ms `is-copied` transient class using `window.setTimeout`, mirroring `ANCHOR_FLASH_CLASS`
in `FeedRows.tsx`.

- [ ] **Step 3: Verify**

```bash
pnpm -F @f-mark/shared build && pnpm -F @f-mark/renderer build
```

- [ ] **Step 4: Commit**

```bash
git add packages/renderer/src/panels/right/RightFiles.tsx packages/renderer/src/panels/right/files/
git commit -m "feat(panels): copy a path by clicking it in Files

copyToClipboard is proven at 8 call sites and Files is the panel most full of
paths. Reuses the .tool-arg-copy style rather than adding a second copy
affordance.

Search was in the review's list but has no panel component - tabMeta declares
the tab and nothing renders it."
```

---

## Task 7: Rename affordance visible on focus

Found independently by two reviewers. A hover-only control is invisible to keyboard users.

**Files:**
- Modify: `packages/renderer/src/panels/right/agents/` — the file rendering the rename control

- [ ] **Step 1: Find it**

```bash
grep -rn "rename" packages/renderer/src/panels/right/agents/ | head
grep -rn "hover" packages/renderer/src/panels/right/agents/*.css packages/renderer/src/shell/shell.css | grep -i "rename\|pencil" | head
```

- [ ] **Step 2: Add focus-within to every hover selector**

```css
/* A hover-only control does not exist for a keyboard user. focus-within
   covers the case where focus lands on the button inside the row. */
.agent-row:hover .agent-rename,
.agent-row:focus-within .agent-rename {
  opacity: 1;
}
.agent-rename:focus-visible {
  opacity: 1;
  outline: 2px solid var(--ink);
  outline-offset: 2px;
}
```

Use the real class names. The focus ring must **not** be transitioned — the guard asserts it.

- [ ] **Step 3: Verify and commit**

```bash
pnpm -F @f-mark/shared build
pnpm -F @f-mark/renderer test --run tests/quality-floor.test.ts
pnpm -F @f-mark/renderer build
git add packages/renderer/src/panels/right/agents/
git commit -m "fix(panels): rename affordance visible on focus, not only hover

Found independently by two reviewers. A hover-only control does not exist for
a keyboard user. focus-within covers focus landing on the button inside the
row; the focus ring is untransitioned per the quality floor."
```

---

## Task 8: Motion consistency batch

### Premise check — verified in `src/` 2026-08-02. TWO of the four sub-items are NOT REAL.

| Sub-item | Verified reality |
|---|---|
| Sliding indicator | **REAL.** `.view-toggle` (`shell.css:2341`) is a flex row of buttons with no indicator element and no transition. One must be added. |
| Context meter transition | **REAL.** `.agent-context-meter span` (`shell.css:4015`) sets `width: var(--context-used, 0%)` with **no** transition, so it jumps after Compact instead of dropping. Note it animates **width**, not the `clip-path` this plan assumed — a 6px solid bar, so width is fine and there is no gradient to distort. |
| Model/effort chevron rotation | **NOT REAL — SKIP.** There is no chevron in `components/participantStrip/` at all. Zero matches for `chev`. |
| FlowCard diagnosed-node pulse | **NOT REAL — SKIP.** `cards/FlowCard.tsx` renders `@xyflow/react` nodes and its state concept is `focused` (`:72-73`), not "diagnosed". Nothing to pulse. Do not invent one. |

Do only the two real items. Skipping the other two is the correct outcome, not an incomplete task.

Four small motion fixes that share one theme — the app already teaches these conventions elsewhere
and breaks them here. Grouped because each is a few lines and they are reviewed as one idea.

**Files:**
- Modify: `packages/renderer/src/shell/topBar/ViewModeToggle.tsx` (+ its CSS)
- Modify: `packages/renderer/src/panels/right/agents/RightAgentDetails.tsx` (+ its CSS)
- Modify: `packages/renderer/src/components/participantStrip/AgentChipEditorPopover.tsx`
- Modify: `packages/renderer/src/cards/FlowCard.tsx` (+ its CSS) — NOTE: directly under `cards/`, NOT `cards/flow/`; verified 2026-08-02

- [ ] **Step 1: Sliding indicator on the view-mode toggle**

`shell/topBar/ViewModeToggle.tsx:40-53` is a `role="tablist"` div of buttons; the active one
gets `className="active"`. There is NO separate indicator element today — you must add one.
Drive it with `transform: translateX()` from the active index, never by measuring DOM.

```css
/* The active pill slides between segments rather than cutting, so the eye can
   follow which mode it landed on. transform only - animating left/width
   would trigger layout on every frame. */
.viewmode-toggle { position: relative; }
.viewmode-indicator {
  position: absolute;
  inset-block: 3px;
  transition: transform var(--dur-fast) var(--ease-out-quart);
  will-change: transform;
}
@media (prefers-reduced-motion: reduce) {
  .viewmode-indicator { transition-duration: 0.01ms; }
}
```

Drive it with `transform: translateX(...)` computed from the active index, not from measured DOM
positions.

- [ ] **Step 2: Context meter transition**

```css
/* After Compact the meter should visibly drop, not jump - the drop IS the
   feedback that Compact did something. clip-path, not scaleX: scaling
   distorts the gradient and the border radius. */
.ctx-meter-fill {
  transition: clip-path var(--dur-slow) var(--ease-out-quart);
}
@media (prefers-reduced-motion: reduce) {
  .ctx-meter-fill { transition-duration: 0.01ms; }
}
```

Find the real fill class in `RightAgentDetails.tsx` first. **Do not** give the meter a colour
threshold — `--warn` means stale and `--alarm` means destruction; a second meaning is forbidden by
the one-meaning rule.

- [ ] **Step 3: Rotate the model/effort chevrons on open**

The app already rotates chevrons elsewhere; these break the convention it teaches.

```css
.agent-chip-chevron {
  transition: transform var(--dur-fast) var(--ease-out-quart);
}
.agent-chip-editor[data-open="true"] .agent-chip-chevron {
  transform: rotate(180deg);
}
@media (prefers-reduced-motion: reduce) {
  .agent-chip-chevron { transition-duration: 0.01ms; }
}
```

- [ ] **Step 4: Single-shot pulse on FlowCard's diagnosed node**

The file is `packages/renderer/src/cards/FlowCard.tsx` (`cards/flow/` is a different directory).
Confirm a diagnosed-node concept actually exists there before styling one — if it does not,
report that and skip this sub-item rather than inventing it.

```css
/* Single-shot, not a loop: a looping pulse becomes wallpaper and competes
   with the agent-working signal for attention. */
.flow-node.is-diagnosed {
  animation: flow-diagnosed-pulse 900ms var(--ease-out-quart) 1;
}
@keyframes flow-diagnosed-pulse {
  0% { box-shadow: 0 0 0 0 var(--alarm); }
  100% { box-shadow: 0 0 0 10px transparent; }
}
@media (prefers-reduced-motion: reduce) {
  .flow-node.is-diagnosed { animation: none; }
}
```

- [ ] **Step 5: Verify everything**

```bash
pnpm -F @f-mark/shared build
pnpm -F @f-mark/renderer test --run tests/quality-floor.test.ts
pnpm -F @f-mark/renderer build
pnpm -F @f-mark/renderer test --run --reporter=json --outputFile=/tmp/polish-now.json 2>&1 | tail -3
node -e '
const base=require("./docs/ui-sweep/2026-08-02-test-baseline.json");
const now=require("/tmp/polish-now.json");
const f=[...new Set(now.testResults.filter(t=>t.status!=="passed").map(t=>t.name))].sort();
console.log("NEW failing files:",f.filter(x=>!base.includes(x)).length);
'
```

Expected: quality floor 3 passed, build exits 0, `NEW failing files: 0`.

- [ ] **Step 6: Commit**

```bash
git add packages/renderer/src/shell/topBar/ViewModeToggle.tsx packages/renderer/src/panels/right/agents/RightAgentDetails.tsx packages/renderer/src/components/participantStrip/AgentChipEditorPopover.tsx packages/renderer/src/cards/flow/FlowCard.tsx packages/renderer/src/shell/shell.css packages/renderer/src/components/chips.css packages/renderer/src/cards/cards.css
git commit -m "feat(motion): four conventions the app teaches but broke

Sliding view-mode indicator so the eye can follow which segment it landed on,
driven by transform rather than left/width to keep layout off the frame path.

Context meter transitions on Compact - the visible drop IS the feedback that
Compact did something. clip-path rather than scaleX, which distorts the
gradient and the radius. No colour threshold: warn means stale and alarm
means destruction, and a second meaning is forbidden.

Model and effort chevrons rotate on open, matching chevrons elsewhere.

FlowCard's diagnosed node pulses once. Looping would become wallpaper and
compete with the agent-working signal."
```

---

## Self-review

**Spec coverage.** Of the polish review's 24 improvements, this plan implements the twelve whose
target files exist. Combined with the Aurora foundation plan's four, **sixteen of the 24 ship**,
including **eight of the nine starred**.

| Starred item | Where |
|---|---|
| Live wait timer | foundation plan, Task 6 |
| Live "last event Xs ago" | Task 1 |
| Approval confirmation | Task 2 |
| Busy on Spawn / Send | Task 3 |
| Menu close animation | Task 4 |
| Tool disclosure height | Task 5 |
| Copy-on-click in Files | Task 6 (+ foundation Task 5 for tool args) |
| Rename pencil on focus | Task 7 |
| **Sparkline tinted by outcome** | **blocked — no sparkline exists; dashboard plan** |

**Two review findings are dropped as already-shipped in `src/`:** the "Allow always" label
inconsistency and the unrendered empty state. Both were lab artifacts. Verified by source.

**Six are deferred to screen plans:** sparkline tint, sparkline draw-in, toast countdown, dashboard
crossfade, "Doing now" elapsed, "last ping" tooltip, "Recent" rows clickable, and the
conversation/terminal segmented control.

**Two were dropped by Oran and are not planned:** the last-read marker (redundant with the unread
dots already driven by the same `savedAnchor`) and the sticky turn header (`projectFeed` emits
interleaved top-level items, so a "turn" is not one contiguous region).

**Placeholder scan:** no "TBD", no "add error handling". Six steps say "find the real class name
first" — deliberate verification, because the local identifier cannot be known without reading the
file, and guessing it is how a plan produces dead CSS.

**Type consistency:** `formatElapsed(ms: number): string` is defined in the foundation plan and
consumed in Task 1. `formatApprovalStatus(status, scope, at): string` is defined and consumed in
Task 2 only. `useAgentSpawn`'s `busy: boolean` is additive; Task 3 Step 1 enumerates consumers
before changing the return shape.

**Known risk:** Task 3 changes a hook's return shape. If `useAgentSpawn` has consumers beyond the
launcher, each must keep compiling — Step 1 exists to find them before Step 2 writes anything.
