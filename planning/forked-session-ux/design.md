# Forked-session UX — Final design (best-of-breed merge)

Status: approved by buddy review pass 2 (planning/forked-session-ux/buddy_review.md). All 14 verified findings and 5 under-specified items applied. This is the implementation spec.

---

## 1. Feature scope

When the user forks a session via `ForkSessionPopover`:

1. **Source** session gains a single `fork-link(direction:"to", other=fork)` event written at the fork instant, authored by a system participant `sys-fork`. Rendered as a quiet inline "Forked to **{fork-slug}**" card, clickable to navigate to the fork.
2. **Fork** session gains a single `fork-link(direction:"from", other=source)` event, same author, also rendered as a quiet inline "Forked from **{source-slug}**" card.
3. **Generic** anchor rule: on first open of any session, if `lastSeenBySession[sessionId]` is unset, seed it to the highest loaded filename, scroll feed to bottom, enable follow mode. Forks ride this generic rule for the "everything looks read" behavior.

Out of scope: backfill for legacy `.fork.json`-only sessions; renaming a fork; multi-fork tracking UI; per-clicker attribution.

## 2. Data model

### 2.1 New EventKind

`packages/shared/src/events.ts`:

```ts
export type EventKind =
  | "prose" | "choices" | "choice" | "turn-end" | "todo" | "html"
  | "file" | "tool-use" | "subagent-run" | "subagent-output"
  | "access-request" | "access-response" | "flow"
  | "fork-link"; // new
```

### 2.2 Payload + typed record

```ts
export interface ForkLinkPayload {
  schema: "fmark.fork-link.v1";
  direction: "from" | "to";
  other_session_id: string;
  other_session_slug: string;
  /** Reserved; v1 forks are always same-root (see §3.4), so this stays
   *  unset until cross-root forks land. */
  other_path?: string;
}

export interface ForkLinkEventRecord extends EventRecord<ForkLinkPayload> {
  kind: "fork-link";
}
```

Append `ForkLinkEventRecord` to the `AnyEventRecord` union in `packages/shared/src/events.ts:403-417`.

### 2.3 Participant kind widening

`packages/shared/src/participants.ts` already exports `ParticipantKind = "user" | "agent" | "sys" | "grp"`, **but** the following struct types are still hard-pinned to `"user" | "agent"` and must each be widened to `"user" | "agent" | "sys"`:

- `packages/shared/src/participants.ts:3` — shared `Participant.kind`
- `packages/shared/src/participants.ts:45` — shared `UpdatedParticipant.kind`
- `packages/kernel/src/project.ts:15-20` — kernel `Participant.kind`
- `packages/kernel/src/participants.ts:72-77` — `UpdatedParticipant.kind`

No migration: existing `participants.json` rows are untouched; new `"sys"` kind is additive.

## 3. Server-side flow

### 3.1 Timestamp-aware writer

Refactor `packages/kernel/src/events/writer.ts:writeEventFile` to accept an optional starting timestamp:

```ts
export interface WriteEventInput {
  participant_id: string;
  kind: EventKind;
  ext: string;
  contents: string;
  /** When set, the writer starts the collision-bump loop here instead of
   *  calling isoTimestamp(). Used for synchronized cross-session writes. */
  timestamp?: string;
}
```

Inside, `let stamped = input.timestamp ?? isoTimestamp();` — the rest of the 256-attempt millisecond-bump loop is unchanged.

**Invariant**: callers supplying the same `timestamp` to two `writeEventFile` calls share a **requested** starting timestamp; the actual filenames may diverge by a few ms on `EEXIST` collisions inside one session. That divergence is acceptable for fork-link cards because each card's displayed time is read from its own filename.

### 3.2 `sys-fork` participant

Helper inside `packages/kernel/src/participants.ts` (lives next to `readParticipants` and the private `writeParticipants`):

```ts
export const SYS_FORK_PARTICIPANT_ID = "sys-fork";
export const SYS_FORK_NAME = "Fork";
export const SYS_FORK_COLOR = "#71717a"; // zinc-500 — muted neutral

export async function ensureSystemForkParticipant(p: Paths): Promise<void> {
  const participants = await readParticipants(p);
  const existing = participants[SYS_FORK_PARTICIPANT_ID];
  if (
    existing !== undefined &&
    existing.kind === "sys" &&
    existing.name === SYS_FORK_NAME &&
    existing.color === SYS_FORK_COLOR
  ) {
    return; // already correct
  }
  // Repair policy: if `sys-fork` exists with the wrong kind/name/color
  // (e.g., someone manually wrote a sys-prefixed agent), overwrite with
  // the canonical system row. We never write `sys-*` IDs elsewhere, so
  // collision risk is essentially nil; repair keeps the UX deterministic.
  const next: Record<string, Participant> = {
    ...participants,
    [SYS_FORK_PARTICIPANT_ID]: {
      kind: "sys",
      name: SYS_FORK_NAME,
      color: SYS_FORK_COLOR,
    },
  };
  await writeParticipants(p, next); // private helper; reuse via module-local access
}
```

`writeParticipants` is currently `async function writeParticipants` (not exported). Either keep `ensureSystemForkParticipant` co-located in the same module so it can call the private writer directly, OR change `writeParticipants` to `export async function`. Co-location keeps the surface area smaller — adopt that.

Called from §3.4 **before** the directory copy as a preflight.

### 3.3 Fork-link writer service

New file `packages/kernel/src/services/forkLinkWriter.ts`:

```ts
export interface ForkLinkWriteInput {
  p: Paths;                 // v1 same root for source + fork
  sourceSessionId: string;
  forkSessionId: string;
  sourceSlug: string;
  forkSlug: string;
  /** Shared fork-instant starting timestamp. */
  timestamp: string;
  bus: Bus | null;
}

export type ForkLinkWriteSideResult =
  | { filename: string }
  | { error: string };

export interface ForkLinkWriteResult {
  source: ForkLinkWriteSideResult;
  fork:   ForkLinkWriteSideResult;
}

export async function writeForkLinkPair(
  input: ForkLinkWriteInput,
): Promise<ForkLinkWriteResult>;
```

Behavior:

1. Build payloads:
   - source side: `{ schema, direction:"to",   other_session_id: forkSessionId,   other_session_slug: forkSlug }`
   - fork side:   `{ schema, direction:"from", other_session_id: sourceSessionId, other_session_slug: sourceSlug }`
2. For each side, attempt `writeEventFile(input.p, sessionId, { participant_id: SYS_FORK_PARTICIPANT_ID, kind: "fork-link", ext: "json", contents: JSON.stringify(payload), timestamp: input.timestamp })`.
3. Wrap each call in its own try/catch — never throw out of the function. On success: `{ filename }`. On failure: `{ error: message }`.
4. After each success, **guarded** publish: `if (input.bus !== null) publishEventWrite(input.bus, sessionId, { filename, kind: "fork-link", participantId: SYS_FORK_PARTICIPANT_ID });`. Matches the actual `publishEventWrite` signature (`packages/kernel/src/services/eventPublisher.ts:11-32`).
5. Return both side-results.

### 3.4 Fork-link copy exclusion (NEW SECTION — Codex finding #6)

`forkSessionFolder` currently `cp(sourceDir, tempDir, { recursive: true, ... })` copies every file (`packages/kernel/src/sessions.ts:147`). After the first fork, the source contains a `*_sys-fork.fork-link.json` file. A second fork would copy that into the new fork — meaning the new fork would have a `fork-link(to: <previous fork>)` event that does not belong to it. Worse, fork-of-a-fork would inherit the parent fork's `fork-link(from: <grandparent>)`.

Fix: filter fork-link event files out of the copy.

```ts
// packages/kernel/src/sessions.ts
const FORK_LINK_FILENAME_RE = /\.fork-link\.json$/;

await cp(sourceDir, tempDir, {
  recursive: true,
  force: false,
  errorOnExist: true,
  preserveTimestamps: true,
  filter: (src) => !FORK_LINK_FILENAME_RE.test(src),
});
```

`countEntries` must reflect the post-filter set so `copied_entries` in the response is accurate. Update `countEntries` to accept the same predicate (or inline the recursion at the call site with the predicate).

Tests must cover:
- Second fork from the same source: new fork does NOT contain the first fork's source-side `fork-link(to)` event.
- Fork of a fork: child does NOT inherit the parent's `fork-link(from)` event.

### 3.5 Fork route changes

`packages/kernel/src/routes/sessions.ts` POST `/sessions/:id/fork` (around lines 285-427):

```ts
const T = isoTimestamp();
await ensureSystemForkParticipant(p);       // preflight (cheap, idempotent)
const fork = await forkSessionFolder(p, {...}); // unchanged contract, now filters fork-link files

// derive source slug — no `deriveSlug` helper exists; reuse the same
// regex forkSessionFolder uses (sessions.ts:124):
const sourceSlug = sourceSessionId.replace(/^\d{4}-\d{2}-\d{2}-/, "");

const linkResults = await writeForkLinkPair({
  p,
  sourceSessionId,
  forkSessionId: fork.session.id,
  sourceSlug,
  forkSlug: fork.session.slug,
  timestamp: T,
  bus: getBus?.() ?? null,
});

const linkWarnings: string[] = [];
if ("error" in linkResults.source) {
  linkWarnings.push(`source fork-link write failed: ${linkResults.source.error}`);
}
if ("error" in linkResults.fork) {
  linkWarnings.push(`fork fork-link write failed: ${linkResults.fork.error}`);
}

// ... existing agent rebind ...

return {
  source_session_id: sourceSessionId,
  session,
  copied_entries: fork.copied_entries,
  agents,
  warnings: [...warnings, ...linkWarnings],
};
```

The existing `bus.publish({ type: "session.forked", ... })` stays as-is. The route's `body.path` (`packages/kernel/src/routes/sessions.ts:314-336`) selects the SOURCE root; v1 forks are always same-root, so no `other_path` is recorded.

**Critical**: link-write failures DO NOT promote to HTTP 400. The fork is canonical once `forkSessionFolder` returns; link events are durable UX markers that may be missing on write failure (Codex critique #1).

## 4. Renderer integration

### 4.1 EventCard dispatcher

`packages/renderer/src/cards/EventCard.tsx`:

```tsx
if (event.kind === "fork-link") {
  return <ForkLinkCard event={event as ForkLinkEventRecord} />;
}
```

### 4.2 ForkLinkCard component

New `packages/renderer/src/cards/ForkLinkCard.tsx`. Cross-path navigation reuses the exact sequence used in `packages/renderer/src/panels/Sessions.tsx:187-213` (Codex finding #12):

```tsx
async function onClick(): Promise<void> {
  const { other_session_id, other_path } = event.payload;
  if (other_path !== undefined && other_path !== activePath) {
    const client = createClient({ baseUrl: "", token });
    await client.setActivePath(other_path);
    const paths = await client.getPaths();
    setPathsState(paths);
    const [sessions, participants] = await Promise.all([
      client.listSessions(),
      client.listParticipants(),
    ]);
    setSessions(sessions);
    setParticipants(participants);
  }
  setCurrentSession(other_session_id);
}
```

(v1 will rarely hit the cross-path branch since `other_path` is reserved/unset, but the implementation is in place for when cross-root forks land.)

### 4.3 Visual style

CSS class `.fork-link-card` using **real** repo tokens (Codex finding #9 — `--border-subtle`/`--surface-1`/`--ink-1` do not exist):

- `display: inline-flex`, gap `8px`, padding `4px 10px`
- `border: var(--border-w) solid var(--line-2)`, `border-radius: var(--radius)`
- `background: var(--panel)` (or `color-mix(in srgb, var(--canvas), var(--panel) 30%)` for a slightly lighter feel)
- Label color `var(--ink-2)`, slug color `var(--ink)`
- Hover: lift to `var(--panel-2)`; focus ring uses the existing button focus pattern
- `font-size: 12px`
- NO participant stripe, NO warning colors
- Icon: `GitFork` from lucide-react (matches `ForkSessionPopover`'s use)
- `button` semantics for the entire card

Closer in weight to `TurnEndDivider` than `AccessRequestCard`.

### 4.4 aggregate.ts

`packages/renderer/src/state/aggregate.ts` — `feedConversation` is a boolean filter expression inside `aggregate()`, not a separate exported array (Codex finding #11). Locate the `feedConversation` filter (around line 231) and add a clause that accepts `e.kind === "fork-link"`. Leave `feedDocument` untouched (it intentionally strips system noise).

### 4.5 Exhaustive EventKind maps

Three exhaustive `Record<EventKind, ...>` maps must gain a `fork-link` entry (Codex findings #8, #10):

1. `packages/renderer/src/panels/right/RightLog.tsx:44` — `KIND_ICON` (use `GitFork`) and `KIND_LABEL` (`"Fork"`).
2. `packages/renderer/src/panels/right/RightLog.tsx:152` — `shortSummary` switch: for `fork-link`, return `"Forked to {slug}"` or `"Forked from {slug}"` based on `direction`.
3. `packages/renderer/src/popovers/log-filter-types.ts:35` — `FILTERABLE_KINDS`; default-on.
4. `packages/renderer/src/render/BlockAccordion.tsx:37` — third `Record<EventKind, string>`; add `"fork-link"` (or relax to `Partial<Record<EventKind, string>>` with a fallback if no meaningful label exists in this context).

### 4.6 Hide `sys` participants from end-user pickers

The new `sys-fork` participant lands in the global participants map. Two UI pickers iterate every participant and would surface it inappropriately (Codex under-specified item #2):

- `packages/renderer/src/compose/CreateTodoPopover.tsx:75` — assignee picker
- `packages/renderer/src/cards/TodoItem.tsx:82` — re-assign picker

Add `kind !== "sys"` to both filters. The card-author display (avatar, name) continues to resolve correctly for `sys-fork` because that data flows through `participants[event.participant_id]` lookups, not through these pickers.

## 5. Generic anchor-seeding rule

### 5.1 Feed.tsx restore-effect rewrite

`packages/renderer/src/shell/Feed.tsx` — extend the restore effect at lines 132-147. Two structural fixes vs. design_v1 (Codex finding #7):

1. **Move the `itemKey` `useCallback` (currently lines 176-182) ABOVE the restore effect** so the effect can list it in its dependency array without a TDZ violation.
2. **Get `root` before setting `restoredSessionRef.current`** so a null root doesn't permanently skip the seed/scroll on a re-mount.

Updated effect:

```tsx
useEffect(() => {
  if (currentSessionId === null) return;
  if (items.length === 0) return;
  if (restoredSessionRef.current === currentSessionId) return;
  const root = scrollRef.current;
  if (root === null) return;          // try again on next render
  restoredSessionRef.current = currentSessionId;
  programmaticUntilRef.current = Date.now() + PROGRAMMATIC_SCROLL_MS;

  if (savedAnchor === undefined) {
    // First-open rule: seed to highest, scroll to bottom, enable follow.
    const lastItem = items[items.length - 1];
    if (lastItem !== undefined) markSeen(itemKey(lastItem));
    root.scrollTo({ top: root.scrollHeight });
    setFollowMode(true);
    return;
  }

  const el = root.querySelector(
    `[data-event-filename="${cssEscape(savedAnchor)}"]`,
  );
  if (el instanceof HTMLElement) {
    el.scrollIntoView({ block: "center" });
  }
}, [
  currentSessionId,
  items, // need full ref to read last item; items.length insufficient
  savedAnchor,
  itemKey,
  markSeen,
  setFollowMode,
]);
```

Notes:

- `markSeen` is monotonic (`packages/renderer/src/state/store.ts:734`), so a later IntersectionObserver-driven `markSeen` call cannot regress the anchor.
- The current single-fetch session load (`packages/renderer/src/App.tsx:254`) means items arrive as one batch; the guard `restoredSessionRef.current === currentSessionId` correctly fires once per session even if items re-render.
- Live `event_added` updates AFTER the first restore should NOT advance the anchor — they pass through the existing IntersectionObserver path only when the user actually scrolls them into view. Confirmed by the fact that the new branch returns immediately after the seed.

## 6. ForkSessionPopover

No changes. The popover already calls `setCurrentSession(response.session.id)`. Once the fork dir exists and §3-5 are in place, navigating to the fork triggers the new restore-effect branch and shows the bottom-anchored card naturally.

## 7. Bus / WebSocket

No new bus messages. `event_added` from `writeForkLinkPair` drives source-window live updates via the existing `App.tsx:362-383` refresh path. `session.forked` remains a no-op in `App.tsx:358`.

## 8. Tests

### 8.1 Kernel route tests (`packages/kernel/tests/routes/sessions.test.ts`)

Bootstrap a new `describe("POST /sessions/:id/fork", ...)` block (none exists today — Codex finding #13):

- Source gets exactly one `fork-link(direction:"to")` event with payload pointing at the fork id/slug.
- Fork gets exactly one `fork-link(direction:"from")` event with payload pointing at the source id/slug.
- `sys-fork` participant exists in `.f-mark/participants.json` after the call with `kind: "sys"`.
- Calling fork twice does NOT duplicate `sys-fork`.
- `.fork.json` is still written (regression guard).
- When `bus` is set, two `event_added` messages are published (one per session_id).
- **Second fork from same source**: fork B does NOT contain fork A's source-side `fork-link(to)` event.
- **Fork of a fork**: grandchild does NOT contain the parent's `fork-link(from)` event.
- **Existing `sys-fork` with wrong kind**: `ensureSystemForkParticipant` repairs it.
- **Link-write failure** (mock `writeForkLinkPair` to inject a per-side error): response is HTTP 200 with `warnings` non-empty; fork directory still exists.

### 8.2 Writer test (`packages/kernel/tests/events/writer.test.ts`)

- Explicit `timestamp` input is honored: filename uses the supplied starting timestamp.
- Collision behavior: when a file already exists at the requested timestamp, the next attempt is `+1ms` (covers fork-link concurrency).

### 8.3 Fork-link service test (NEW file `packages/kernel/tests/services/forkLinkWriter.test.ts`)

- Source-only write failure: returns `{ source: { error }, fork: { filename } }` without throwing.
- Fork-only write failure: returns `{ source: { filename }, fork: { error } }` without throwing.
- Bus is null: function still succeeds; no publish calls.
- Bus is set: `publishEventWrite` called once per successful side.

### 8.4 Renderer Feed first-open test

- New session loaded with `lastSeenBySession[sid]` undefined and 3 events: after restore effect, `lastSeenBySession[sid]` equals the highest filename, no unread floater, scroll position at bottom.
- Existing anchored behavior (scroll-to-center) preserved when an anchor is set.

### 8.5 ForkLinkCard click test

- Same-path: click → `setCurrentSession(other_session_id)`; no `setActivePath` call.
- Cross-path: click → `setActivePath(other_path)` → `getPaths` → `listSessions` / `listParticipants` → `setCurrentSession` in that exact order, matching `Sessions.tsx:187-213`.

### 8.6 Hot test update

`packages/kernel/tests/hot/phase17-session-fork-hot.mjs` currently asserts byte-for-byte equivalence between source and fork snapshots (lines 604, 608) and uses the post-fork source snapshot as the MCP-write invariant baseline (line 626) (Codex finding #14). Update:

- After-fork source snapshot is allowed to contain exactly one additional `*_sys-fork.fork-link.json` file.
- After-fork fork snapshot is allowed to contain exactly one additional `*_sys-fork.fork-link.json` file AND must NOT contain any source-side `fork-link(to)` event.
- The MCP-write invariant baseline is recomputed from the post-fork source snapshot (so the existing assertion logic remains valid).

## 9. File-by-file change list

**Modified:**

1. `packages/shared/src/events.ts` — `EventKind` member, `ForkLinkPayload`, `ForkLinkEventRecord`, extend `AnyEventRecord`.
2. `packages/shared/src/participants.ts` — widen `Participant.kind` and `UpdatedParticipant.kind` to include `"sys"`.
3. `packages/kernel/src/project.ts` — widen `Participant.kind` to include `"sys"`.
4. `packages/kernel/src/participants.ts` — widen kernel `UpdatedParticipant.kind`; add `SYS_FORK_*` constants + `ensureSystemForkParticipant`.
5. `packages/kernel/src/events/writer.ts` — optional `timestamp` input.
6. `packages/kernel/src/sessions.ts` — `cp` filter excluding `*.fork-link.json` files; `countEntries` honors same filter.
7. `packages/kernel/src/routes/sessions.ts` — preflight `sys-fork`, call `writeForkLinkPair`, demote link errors to warnings, inline source-slug derivation.
8. `packages/renderer/src/cards/EventCard.tsx` — dispatch new kind.
9. `packages/renderer/src/cards/cards.css` — `.fork-link-card` styles using real tokens (`--line-2`, `--panel`, `--panel-2`, `--ink-2`, `--ink`).
10. `packages/renderer/src/state/aggregate.ts` — widen `feedConversation` filter to accept `fork-link`.
11. `packages/renderer/src/shell/Feed.tsx` — restore-effect rewrite per §5.1 (move `itemKey` above; reorder root check; new first-open branch).
12. `packages/renderer/src/panels/right/RightLog.tsx` — `KIND_ICON`, `KIND_LABEL`, `shortSummary` entries.
13. `packages/renderer/src/popovers/log-filter-types.ts` — `FILTERABLE_KINDS` entry, default-on.
14. `packages/renderer/src/render/BlockAccordion.tsx` — third `Record<EventKind, string>` entry.
15. `packages/renderer/src/compose/CreateTodoPopover.tsx` — filter out `kind === "sys"` from assignee picker.
16. `packages/renderer/src/cards/TodoItem.tsx` — filter out `kind === "sys"` from re-assign picker.

**New:**

17. `packages/kernel/src/services/forkLinkWriter.ts` — `writeForkLinkPair`.
18. `packages/renderer/src/cards/ForkLinkCard.tsx` — UI component.

**Tests:**

19. `packages/kernel/tests/routes/sessions.test.ts` — new `describe("POST /sessions/:id/fork", ...)` block per §8.1.
20. `packages/kernel/tests/events/writer.test.ts` — explicit-timestamp + collision tests (§8.2). May be a new file.
21. `packages/kernel/tests/services/forkLinkWriter.test.ts` — new file (§8.3).
22. `packages/renderer/src/shell/Feed.firstOpen.test.tsx` — new file (§8.4). May extend an existing Feed test instead.
23. `packages/renderer/src/cards/ForkLinkCard.test.tsx` — new file (§8.5).
24. `packages/kernel/tests/hot/phase17-session-fork-hot.mjs` — relax byte-for-byte source/fork assertions per §8.6.

## 10. Failure invariants

- `forkSessionFolder` succeeds → fork is **canonical**. The HTTP response is 200 regardless of link-write outcomes.
- Either link-write failure → response includes `warnings`. The system is left self-consistent: source may have its link event, fork may have its link event, neither may have it, or both. No state requires compensation.
- The `sys-fork` participant is created exactly once per project path, idempotently, and repaired in place if it exists with wrong fields.
- **Existing `fork-link` event files are explicitly excluded from fork copies; each session receives only link markers written for that session after the copy.** Fork-of-a-fork and second-fork-from-same-source both produce clean trees.
- `markSeen` is monotonic; the §5.1 seed rule can never regress an already-saved anchor.

## 11. Out of scope (explicit non-goals)

- Backfill of legacy `.fork.json`-only sessions — they remain card-less.
- Multi-fork tracking UI (e.g., "this session has 3 forks" badge).
- Per-fork attribution to the clicking user — `sys-fork` is the only author.
- Cross-root forks — `body.path` selects the SOURCE root in v1; fork lives in the same root. `other_path` in `ForkLinkPayload` is reserved.
- Renaming a fork after creation.
