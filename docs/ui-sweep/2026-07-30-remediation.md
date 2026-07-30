# F-Mark — Remediation Plan

**Input:** `2026-07-30-ui-sweep.md` — 2 Blockers, 14 High, 21 Medium, 6 Nit, 6 dead components.
**Output:** 12 clusters. Every one of the 43 findings is mapped to exactly one, indexed at the end.

Each cluster was re-verified against source before a fix was prescribed — the sweep's citations were
good, but a fix depends on the exact code shape, and the sweep itself got things wrong. Verification
changed the diagnosis in four places and found one defect the sweep missed. Those are marked
**⚑ new** and **⚑ corrected**.

---

## The thesis

F-Mark's premise is _the event log is the state_. Two rules follow from that premise, and they are
the same rule seen from both ends:

> **Validate on write. Derive on read.**
> The log must be incapable of holding an invalid state, and must contain no derived state.

Most of F-Mark honours this. The findings cluster tightly around the places that invert it:

| Inversion                              | Where              | Cost                                                     |
| -------------------------------------- | ------------------ | -------------------------------------------------------- |
| Validates on **read**                  | todo cycles (M1)   | the log can hold a cycle; every reader must defend       |
| Derives on **write**                   | HTML bundles (M3)  | a projection is baked into the log, then re-derived      |
| Derives blast radius on the **client** | todo cascade (H2)  | the UI's confirmation disagrees with the server's action |
| One edge, five meanings                | `supersedes` (H14) | a projection cannot tell an edit from an annotation      |

The rest is a second, more ordinary theme, and it is genuinely good news:

> **The right abstraction almost always already exists in the codebase. It just isn't applied at the
> site that matters.**

`Popover` exists (17 importers) — the mention picker hand-rolls its own. `isResolvedCommentMarker`
exists — the visibility pass doesn't call it. `resolveExecutableForExec` exists — the spawn path
doesn't call it. `wouldCreateCycle` exists — the write path doesn't call it. Confirmation exists on
the right panel — the chip popover doesn't do it.

That means most of this plan is _reconnecting existing parts_, not building new ones. It is a much
smaller job than 43 findings suggests. It also explains why these defects survived review: every one
of them looks correct next to a sibling that does the right thing.

---

## Cluster A · Destructive actions have no single contract

**Closes:** B1, B2, H1, H2, M2 · **⚑ new** A6 · **Severity: highest. Do this first.**

### Root cause

F-Mark has **three** confirmation mechanisms and no authority among them:

1. `window.confirm` — 7 call sites, verified: `AgentPopover.tsx:410,423`,
   `RightAgentControls.tsx:126,163`, `useSessionDelete.ts:17`, `useAgentsController.ts:109`,
   `useProjectPromotion.ts:23`
2. A bespoke in-UI component — `cards/todoItem/TodoConfirmRemove.tsx`
3. A server-side confirm-token — `spawnRoutes/confirmTokens.ts`

Nothing decides which applies. So each surface picks one, or picks none. The two Blockers are both
"picked none," and H1 is the same action guarded on one surface and not another.

### ⚑ corrected — the confirm-token cannot do the job it was built for

`confirmTokens.ts` mints a random nonce with a 10s TTL and deletes it on consume. B2 called this
"defeated by the UI." That is the symptom. The cause is a category error:

> **A server cannot verify human confirmation.** A nonce proves request freshness. It cannot prove a
> human saw a dialog, because the client mints and spends it in the same code path — which is
> exactly what `useAgentTerminalsController.ts:144-174` does, legally.

This matters more than a bug, because it explains B2's _origin_: the team reasonably believed the
kernel guarded `goodbye`, so the UI didn't have to. Misplaced trust in a guard that structurally
cannot deliver the guarantee is how you get a destructive action behind an `×`.

### Prescribed fix

**A1. One destructive-action primitive, enforced by types.** Add `useDestructiveAction()` returning a
promise that resolves only after a real dialog resolves. Then make the destructive client methods
(`goodbye`, `deleteSession`, `revertFile`, `removeRuntime`, todo-remove) **unreachable except through
it** — take a `ConfirmationReceipt` branded type that only the hook can mint. This is the load-bearing
choice: a convention that says "remember to confirm" produces B2 again in six months; a signature that
won't compile without one cannot.

**A2. Re-scope the confirm-token to what it can actually do.** Keep it, document it as replay/
double-submit protection, and stop describing it as confirmation. Renaming it (`intentToken` →
`requestNonce`) is most of the fix, because the name is what caused the misplaced trust.

**A3. Blast radius comes from the authority that applies it.** H2's real cause is not prop-drilling —
it is that the cascade is computed **twice, from two different datasets**. `writeTodoEvent`
(`services/events.ts:773-786`) reads the full corpus and cascades via `findDescendants`; the client
re-derives the same number from whatever `allEvents` it was handed, and `ProseInlineBlock.tsx:102,110`
hands it `[event]` → zero. Fix by having the server return the descendant set (a `?preflight=1` on the
todo write, or a small `GET /todos/:id/descendants`), and let the dialog render the server's number.
**Never re-derive a destructive action's blast radius on the client when the server computes it
authoritatively.** Passing more props fixes today's instance; this fixes the class.

**A4. B1 — untracked file deletion.** Route through A1, and correct the per-hunk label: the sweep is
right that "Revert hunk" reverse-applying a synthetic whole-file hunk is a dishonest label for a
delete. Take the label from `actionsForStatus` intent, not from the control's generic name.

**A5. B2 — the `×`.** Two changes: route `goodbye` through A1, and separate the two verbs.
`AgentTerminals.tsx:12-14` already documents the intended design ("No spawn/close — agents are created
and ended through the agent lifecycle, not here"). The header comment is the spec; the controller
violates it. Either the `×` closes the view (matching the comment), or it is relabelled and confirmed.
Prefer the former — the comment describes the better design.

**⚑ new — A6. Session delete confirms, but its wording is materially misleading.**
The sweep recorded U2's delete-confirmation evidence as unrecoverable. Source settles it without a
re-run: `useSessionDelete.ts:16-20` does call `window.confirm`. **But its text reads:**

> `Delete session "<slug>" from F-Mark? Project files are not deleted.`

That is true and beside the point. The _event log_ is deleted — U2's reconstruction proved the on-disk
session directory disappears — and in a product whose premise is an append-only log you own, the log
is the asset. The dialog reassures you about the thing that was never at risk while staying silent
about the thing being destroyed. Fix the wording to name the loss: event count and that the history is
unrecoverable.

This partially closes the sweep's largest coverage gap. What remains unverified is only whether Cancel
genuinely cancels — cheap to confirm.

---

## Cluster B · `supersedes` is one untyped edge carrying five meanings

**Closes:** H14 (symptoms A and B) · **Severity: highest architectural risk.**

### Root cause — verified, and larger than the sweep stated

`supersedes` currently means all of:

| #   | Meaning                              | Written by                              | Should it hide the target? |
| --- | ------------------------------------ | --------------------------------------- | -------------------------- |
| 1   | **Revision** — replace in projection | MCP `fmark_post_prose`                  | yes                        |
| 2   | **Coalescing** — collapse delta runs | `proseCoalescer.ts:96`                  | yes                        |
| 3   | **Tombstone** — remove chain         | `removed: true` prose                   | yes                        |
| 4   | **Marker** — resolve / unresolve     | `_resolved_` sentinel prose             | **no**                     |
| 5   | **Fork** — sibling supersedors       | inferred, `collectForkSiblingFilenames` | all-but-first              |

`buildSupersedorOf` (`EventAggregator.ts:174-185`) maps every edge identically, and
`superseded = new Set(supersedorOf.keys())` (`:135`) drops all of them from `visible` (`:250-260`).
Meaning 4 therefore behaves like meaning 1: **resolving a comment deletes it from the projection, and
reopening cannot restore it.**

Compounding it, markers are encoded as **magic strings in content** — `commentMarkers.resolved =
"_resolved_"` (`:35-38`), sniffed after the fact by `isResolvedCommentMarker` (`:81-88`). A sentinel in
a content field is invisible to every consumer that doesn't know to look, which is precisely
Symptom B: `panels/Comments.tsx:104` prints `_resolved_` as a comment body.

### The encouraging part

**F-Mark already has the predicate.** `isRemovedCommentMarker` and `isResolvedCommentMarker` exist and
`isCommentActivity` (`:90-96`) correctly excludes both. The concept is right; it is applied in one of
the three places that need it. `buildCommentsByTarget` (`:493`) excludes only `removed`, not
`resolved`.

### Prescribed fix — two tiers

**B1 (surgical, low risk, ship immediately).** Exclude marker events when building the supersession
edge set, and add `isResolvedCommentMarker` to `buildCommentsByTarget`'s exclusion. Two predicates,
already written, called in two more places. Closes both symptoms.

**B2 (structural, the actual fix).** Stop inferring intent from content. Give the edge a type:

```
supersedes: { ref: string, as: "revision" | "coalesce" | "tombstone" | "marker" }
```

with the bare-string form retained and read as `"revision"` for backward compatibility — mandatory,
since existing logs are the user's data and the format is append-only. Then the projection switches on
a declared type instead of guessing, and a sixth meaning cannot be added by writing a new magic string.

Sequence B1 now for the user-visible bug; schedule B2 deliberately — it touches the event contract,
which is the one thing in F-Mark that must never break a reader.

---

## Cluster C · Write/read responsibility is inverted

**Closes:** M1, M3, M5

**C1 — validate cycles on write (M1).** `wouldCreateCycle` (`services/events.ts:564`) is called from
exactly one place, `:608`, inside the tree _builder_. `writeTodoEvent` (`:773`) never calls it, so
`B.parent=A; A.parent=B` both return 200 and the log holds a cycle forever; readers silently re-root
both. Note the write path **already reads the full corpus** when removing (to cascade) — so validating
a reparent is consistent with what the function already does, not a new cost. Return 409.

**C2 — assemble HTML once, on read (M3).** `assembleHtmlBundleIndex` is called at both
`services/events.ts:930` (write) and `routes/raw.ts:110` (read); `removeCompanionAssetTags`
(`htmlBundle.ts:14`) strips only external refs, so the second pass can't undo the first — 4 asset tags
where there should be 2, and every listener binds twice in the core "show me a mockup" flow. Store the
authored HTML plus asset refs; assemble at read only. This is the event-sourcing rule directly: **the
log stores facts, not renderings.**

**C3 — staged attachments need an owner (M5).** `findAttachment` (`routes/files/storage.ts:96-110`)
searches only committed `file` events, so a staged-but-unsent blob is invisible to every route that
could find or delete it — and forking copies the orphan in. Give staged blobs an explicit lifecycle:
a staging index with a TTL reaper, and exclude unreferenced blobs from fork copy. The sweep needing
raw filesystem access to clean up after itself is the proof.

---

## Cluster D · Shared primitives exist but aren't universally used

**Closes:** H6, M10, M11, M16, M19, Nit (focus restore)

`popovers/Popover.tsx` + `PopoverRoot.tsx` exist with 17 importers. `modals/ModalRoot.tsx` exists.
The findings are all surfaces that opted out:

- **H6** — `agentMentionPicker` hand-rolls a `<div>`: no Escape, no outside-click, no auto-close, and
  it swallows clicks underneath. Migrate to `Popover`.
- **M16** — `IntegrationSetupModal` mounted outside `ModalRoot`, so it misses shared Escape handling.
- **M10** — avatar preset picker's own document-level outside-close can kill the whole Settings modal.
- **M11 / M19 / Nit** — focus trap, viewport collision, focus restore: these belong _in_ the
  primitives, once, per [WAI-ARIA APG Dialog](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)
  (move focus in on open, trap while open, restore to trigger on close, `aria-modal`).

**Fix:** implement trap/restore/collision in `Popover` and `ModalRoot`; migrate the four outliers; then
add a lint rule banning `position: fixed`/`absolute` floating containers outside the primitives. The
rule is what stops the fifth outlier — without it this cluster regrows.

---

## Cluster E · Rich domains collapsed to booleans

**Closes:** H5, H7

**E1 (H5).** `AgentChipEditorPopover.tsx:87` — `presenceState !== PRESENCE_STATES.offline` excludes
one of six states, so `launching`, `stale`, `pane-dead` and `hook-not-installed` all count as
"connected," gating `canUseLiveControls`, `canClear`, and `canOpenTerminal` — a dead pane still offers
a terminal. Verified as the **only** negative predicate over this enum, so it's a one-site fix; but
export a named `isLiveControllable(state)` from `shared/managedAgents.ts` so the next caller can't
re-derive it wrong. **Prefer explicit allowlists over `!== one_value` for any enum above two members**
— a negative predicate silently absorbs every state added later.

**E2 (H7).** `ArbitraryGroupBody.tsx:110` returns `false` where it means "no opinion";
`useToolUseDisclosure.ts:52-55` treats `false` as an instruction and clobbers `ToolUseCard.tsx:31`'s
`success === false` default. Since nearly every group a user sees is historical, open-on-failure is
effectively dead. Return `undefined` for "no opinion" and make the tri-state explicit in the type.

---

## Cluster F · Parent-row activation racing an inner control

**Closes:** H12, M20 — the sweep's named pattern

`FileRow.tsx:173-174` binds row-open to `onMouseDown`/`onMouseUp` (deliberate, per `:100`); the star at
`:200` uses `onClick` + `stopPropagation`. Native order is mousedown → mouseup → click, so the row wins
every time and the star also opens the file. The comment at `:141` asserting otherwise is false.
`FileCommentCard`'s path pill is the same shape.

**Fix:** one row-activation convention. Either row-open moves to `onClick` (then `stopPropagation`
works as written), or inner controls are excluded at the row handler via
`event.target.closest("[data-row-action]")`. Prefer the former; the mousedown/up split was for
drag-selection, which `data-row-action` handles without inverting event order. Then delete the false
comment — a comment asserting behaviour the code contradicts is worse than none.

---

## Cluster G · Failures are silent

**Closes:** H8, and H4's diagnosability half

**G1 (H8).** `useChoicesCardModel.ts:71-99` has no try/catch — a failed POST yields an unhandled
rejection and nothing else. Systemic across the ChoicesCard family. Worse, when ends-turn is on it
chains `postTurnEnd` and `wakeSession`, so a mid-chain failure can record the choice and never end the
turn — a stuck session with no error. Add one shared `useMutation`-style wrapper (error state + toast +
busy) and route card mutations through it. Make the chain explicit: either all three steps or a
recorded, visible partial failure.

**G2 (H4, diagnosability).** The spawn failure surfaces as HTTP 500 _"tmux set-option failed: no
server running"_ — naming the wrong subsystem. The sweep proved by controlled experiment that the real
cause is pane-command-not-found: the pane exits, so the server exits. Detect the empty-server case and
report the actual cause (executable not found on the spawn PATH).

---

## Cluster H · Display and behaviour derive from different sources

**Closes:** H9, H10, M15, M4

- **H10** — `modals/cmdk/sources.ts:409-417` builds the label from `session?.slug ?? active_session`
  but navigates from `active_session` alone; where the first resolves and the second is null (11 of 12
  agents), the row advertises a destination it can't reach. **One source for both, or don't render the
  row.** Cleanest form of the whole cluster: if a target can't be resolved, the affordance shouldn't
  exist.
- **H9** — `CommentActivityCard.tsx:52` falls back to the raw event filename for non-prose targets.
  Add a real label per target kind; never fall back to a filename in user-facing copy.
- **M15** — `RightDiffTree.tsx:462` hard-codes `status.includes("deleted") ? "D" : "R"`, mislabelling
  44 untracked files as "Renamed." Map from the status enum exhaustively.
- **M4** — `AGENT.md` documents three attachment endpoints that 404, plus `disk_path`/`raw_url`/
  `content_url` fields no route produces. **This is the shipped template**, so every project inherits
  it, and it is the protocol agents are told to follow. Either implement the endpoints or cut them; a
  contract test asserting every endpoint in `AGENT.md` resolves is what keeps it honest.

---

## Cluster I · Executable resolution has two answers

**Closes:** H4 (the functional half)

`/env-probe` judges availability with an augmented on-disk search including `~/.local/bin`,
`~/.bun/bin` and mise shims (`routes/envProbe.ts:42-44`, `runtimes/executableSearch.ts:52-65`). The
tmux spawn passes the bare name and resolves via PATH only. So the UI can report "ready" for a runtime
that cannot launch.

`resolveExecutableForExec` exists **precisely to fix this** and is called from exactly one place —
`mcpInstall/index.ts:59` — never the spawn path. Call it from `sessionLauncher`, and have `/env-probe`
report the path it resolved so probe and spawn are answering the same question with the same function.

---

## Cluster J · Accessibility and responsive

**Closes:** M11, M12, M13, M14

Own workstream — mechanical, low-risk, no architectural coupling.

- **M13** — `role="tab"` in 21 files with no roving tabindex and no arrow-key handling. Per
  [WAI-ARIA APG Tabs](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/): one tabstop for the tablist,
  Left/Right to move, `aria-selected` tracking focus. Build one `<Tablist>` and migrate — 21 files is
  a component, not 21 fixes.
- **M12** — 28×28 / 32×32 targets at 1440px (not a small-screen artifact) and 34px cmdk rows. Raise to
  a 44px minimum hit area; visual size can stay.
- **M14** — real horizontal overflow at 768px and 375px; at 375px `.compose-dock` collapses to
  `width: 0`, making the composer non-interactive. Decide the supported floor explicitly. If desktop-
  only is the answer, that is legitimate — but then say so and stop shipping breakpoints that imply
  otherwise.
- **M11** — focus trap, absorbed by Cluster D.

---

## Cluster K · Dead code

**Closes:** the 6-component cluster

`AgentActionMenu` + `agentActionMenu/*` + `useAgentActionMenuController` + `AgentActionMenuPortal`
(toggle wired to a literal `noop()`) · `TerminalOverlay` (mounted, context-wired, only caller
`useSpawnTerminalAction` never invoked, `modalCtx` threaded through three components "for API
compatibility") · `RightAgentDetails.tsx` · `compose/TargetPill.tsx` · `overlays/commentThreadOverlay/*`
and `overlays/CommentThreadOverlay.tsx`.

**Delete, don't deprecate.** The sweep's own experience is the argument: the Phase 2 oracle cited
`commentThreadOverlay` as the live inline-comment surface and propagated that into a dispatch. The
reachable component is `components/lineCommentPopover/InlineCommentThreadPopover.tsx`. Dead code that
misleads your own analysis costs more than dead code that merely sits there — and an agent reading
this repo will make the same mistake, which for F-Mark is the primary readership.

Add `knip` or equivalent to CI so the seventh orphan is caught on arrival.

---

## Cluster L · Genuinely standalone

Real defects, no shared cause. Fix on merit.

| #            | Finding                                                                                                                                          | Prescribed fix                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **H13**      | Monaco `TextModel got disposed` ×5                                                                                                               | **⚑ corrected — upstream, not F-Mark.** `MonacoDiffEditor.tsx` is fully declarative with no manual disposal; it is correct. The bug is in `@monaco-editor/react` + Monaco ≥0.51 on DiffEditor unmount ([monaco-react#647](https://github.com/suren-atoyan/monaco-react/issues/647), **open, no fix**; many dupes upstream). F-Mark is on `monaco-editor ^0.52.2` / `@monaco-editor/react ^4.7.0` — inside the affected range. Don't downgrade to 0.50. Take ownership of the model lifecycle: capture the editor via `onMount` and `setModel(null)` in cleanup _before_ React unmounts. **Priority is signal, not the visible bug** — nothing breaks visually, but 5 spurious console errors per diff session is where a real error goes to hide. |
| **M6**       | Double-submit duplicate prose                                                                                                                    | `sendButton/model.ts:46-65` gates on async React state. Add a synchronous `useRef` lock. Same-tick only; the auditor honestly downgraded it after a realistic `dblclick` produced one POST.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **M7**       | Every write to an assigned todo re-fires the wake                                                                                                | No PATCH exists, so `assigned_to` is carried forward on every update and `shouldWakeAssignedAgent` fires each time — 4 wakes across 4 unrelated toggles. Wake on assignee **transition**, comparing against the prior snapshot the kernel already has.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **M8**       | Duplicate "Refresh" tile                                                                                                                         | Delete one (`AgentPopover.tsx:292` or `:382`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **M17**      | Presence lag at `launching`                                                                                                                      | Auditor retracted to the weak form after observing recovery; no pinned cause. **Reproduce before fixing.** Likely absorbed by E1, which stops `launching` masquerading as connected.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **M18**      | Empty-session state conflates "0 events" with "no agent"                                                                                         | Two distinct placeholders.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **M21**      | `/file-tree` selection not durable                                                                                                               | `useFileTreeLaunch.ts:4-6` reads `window.location` once via `useMemo(…, [])`; the switcher never writes `history.pushState` or `lastFocusedSessionByPath`. Persist on switch.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **Nit 1**    | `.f-mark/` not gitignored under `--no-auth`                                                                                                      | `gitignore.ts` won't create a `.gitignore`; the path that would (`auth.ts:131`) only runs with auth on. Move it out of the auth path. **Highest-value nit** — it decides whether a user accidentally commits their whole event log.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **Nits 2-6** | composer stays "named"; focus not restored (→ Cluster D); removed-agent dot colour; diff dropdown doesn't close; stale `NewSessionModal` comment | Mechanical.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

---

## Sequencing

Ordered by dependency, then by risk.

**1 · Cluster A** — two Blockers and the only unrecoverable data loss. A1 first: it is the primitive
the rest depends on. A6 (delete wording) is a one-line change; do it in the same pass.

**2 · Cluster B tier 1** — two existing predicates called in two more places. Highest
user-visible-fix-per-line in the plan.

**3 · Clusters C, I, G2** — kernel correctness. Independent of the renderer, so parallelisable with 2.

**4 · Cluster D, then F, E** — the primitives land before the migrations that depend on them.

**5 · Clusters H, J, K, L** — mechanical breadth. K (dead code) can jump the queue at any time; it only
subtracts.

**6 · Cluster B tier 2** — the typed edge. Last deliberately: it touches the event contract, the one
thing that must never break a reader of an existing log. Land it with a fixture of pre-change logs
proving old files still project correctly.

**Not in this plan, still open from the sweep:** whether Cancel genuinely cancels on session delete
(A6 closes the rest of that gap), the confounded "session selection reverts" observation, and the
cross-tab / multi-root / real-agent-streaming surfaces the sweep couldn't reach.

---

## Finding → cluster index

All 43 accounted for.

| Finding      | Cluster     |     | Finding | Cluster               |
| ------------ | ----------- | --- | ------- | --------------------- |
| B1           | A           |     | M2      | A                     |
| B2           | A           |     | M3      | C                     |
| H1           | A           |     | M4      | H                     |
| H2           | A           |     | M5      | C                     |
| H3           | _see below_ |     | M6      | L                     |
| H4           | I + G2      |     | M7      | L                     |
| H5           | E           |     | M8      | L                     |
| H6           | D           |     | M9      | → merged into H14 (B) |
| H7           | E           |     | M10     | D                     |
| H8           | G           |     | M11     | D + J                 |
| H9           | H           |     | M12     | J                     |
| H10          | H           |     | M13     | J                     |
| H11          | _see below_ |     | M14     | J                     |
| H12          | F           |     | M15     | H                     |
| H13          | L           |     | M16     | D                     |
| H14          | B           |     | M17     | L                     |
| M1           | C           |     | M18     | L                     |
| Nits 1-6     | L + D       |     | M19     | D                     |
| Dead code ×6 | K           |     | M20     | F                     |
|              |             |     | M21     | L                     |

**Two that resisted clustering, and shouldn't be lost in the tail:**

**H3 · Permission scope can misrepresent what is being granted.** `cards/approvalScope.ts`:
`classifyApprovalSuggestions` is first-wins-per-scope, so a second materially different approve option
is silently dropped; `scopeOfSuggestion` regex-maps `/allow access|and allow/` to `always`. Live, a
5-suggestion payload collapsed to 3 controls, and "Always" mapped to the **narrow** `.bin/`-scoped
grant while rendering as _"Always allow this without asking"_ — the genuinely blanket option invisible.

It is adjacent to Cluster H (display derived separately from meaning) but deserves its own treatment
because of what the screen is: **the one place a human makes a security decision on an agent's
behalf.** Fix: stop inferring scope from prose via regex. The agent's runtime knows the scope of each
suggestion; carry it as a structured field. Render every distinct option — never collapse two grants
into one control — and if scope is unknown, say "scope unclear" rather than guessing. **Treat "I
inferred this from a string" as unacceptable anywhere a permission is granted.**

**H11 · Tab/Shift+Tab on an uncommitted draft todo discards the typed title.**
`TodoTreeLevel.tsx:75-86` vs `:90-107` render `<TodoTreeDraftItem key={draft.id}>` at two structurally
different JSX positions; indent/outdent (`draftTodoActions.ts:38-51,53-65`) mutate exactly the fields
that decide which. React cannot reconcile one key across two positions, so it unmounts and remounts,
and the title — held only in the old mount's local state (`useTodoItemInputs.ts:44`) — is lost.
Committed todos are unaffected, which is why it hides.

Fix: render drafts from **one** JSX position and express nesting through props/indentation rather than
tree position. This is a clean instance of a general React rule worth stating in the codebase:
**a key is only stable within a single parent — if an element can move between parents, its state must
not live in local component state.**

---

## What this plan does not claim

- Fix prescriptions are **verified against source for Clusters A, B, C, D, E, F, I and H13**. The
  remainder are derived from the sweep's citations and should be re-checked at implementation time.
- **M17 has no pinned cause.** Reproduce before fixing.
- **H13's fix is a workaround for an open upstream bug**, not a repair. It should be revisited when
  monaco-react closes #647.
- The sweep's own coverage gaps (U2, cross-tab, multi-root, real agent streaming) are not closed by
  this plan and are still worth a focused run.
