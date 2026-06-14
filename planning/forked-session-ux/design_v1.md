# Forked-session UX — Design v1

> Synthesizes Approach A (Codex pick) with all 10 critique points and 7 recommended adjustments from `planning/forked-session-ux/buddy_pick.md`.

## 1. Feature scope (recap)

When a user forks a session via `ForkSessionPopover`:

1. **Source** session gains a single `fork-link(direction:"to", other=fork)` event written at the fork instant, authored by a system participant `sys-fork`. Rendered as a quiet inline "Forked to **{fork-slug}**" card, clickable to navigate to the fork.
2. **Fork** session gains a single `fork-link(direction:"from", other=source)` event, same author, also rendered as a quiet inline "Forked from **{source-slug}**" card.
3. **On first open of any session (not fork-specific)**: if `lastSeenBySession[sessionId]` is unset, seed it to the highest loaded filename, scroll feed to bottom, enable follow mode. Forks ride this generic rule for the "everything looks read" behavior.

Out of scope: backfill for legacy `.fork.json`-only sessions; mutating any other source artifact.

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
  /** Present when the linked session lives on a different project path. */
  other_path?: string;
}

export interface ForkLinkEventRecord extends EventRecord<ForkLinkPayload> {
  kind: "fork-link";
}
```

Append `ForkLinkEventRecord` to the `AnyEventRecord` union (`packages/shared/src/events.ts:403-417`).

### 2.3 Participant kind widening

`packages/kernel/src/project.ts:15-20` currently constrains `Participant.kind` to `"user" | "agent"`. Widen to `"user" | "agent" | "sys"`. Shared type `packages/shared/src/participants.ts:1` already permits `sys`.

The persisted `.f-mark/participants.json` schema gains a `sys` kind option; no migration needed — existing rows untouched.

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
   *  calling isoTimestamp(). Used for synchronized cross-dir writes. */
  timestamp?: string;
}
```

Inside the function, `let stamped = input.timestamp ?? isoTimestamp();` — rest of the loop is unchanged. The 256-attempt millisecond-bump loop continues to handle collisions on each side independently. The two sides may diverge by a few ms if one collides; that is acceptable (see §10 invariants).

### 3.2 `sys-fork` participant

New helper `packages/kernel/src/participants.ts`:

```ts
export const SYS_FORK_PARTICIPANT_ID = "sys-fork";

export async function ensureSystemForkParticipant(p: Paths): Promise<void> {
  const participants = await loadParticipants(p);
  if (SYS_FORK_PARTICIPANT_ID in participants) return;
  await upsertParticipant(p, SYS_FORK_PARTICIPANT_ID, {
    kind: "sys",
    name: "Fork",
    color: "#71717a", // zinc-500, muted neutral
  });
}
```

Called from §3.3 BEFORE the directory copy (Codex adjustment #4: preflight to remove the most likely avoidable failure mode). Idempotent — safe to call on every fork.

### 3.3 Fork-link writer service

New file `packages/kernel/src/services/forkLinkWriter.ts`:

```ts
export interface ForkLinkWriteInput {
  sourceP: Paths;
  forkP: Paths;
  sourceSessionId: string;
  forkSessionId: string;
  sourceSlug: string;
  forkSlug: string;
  /** Shared fork-instant timestamp. Each side's writer may bump
   *  independently on collision. */
  timestamp: string;
  /** Set when source/fork live on different project paths. */
  sourcePath?: string;
  forkPath?: string;
  bus: Bus | null;
}

export interface ForkLinkWriteResult {
  source: { filename: string } | { error: string };
  fork: { filename: string } | { error: string };
}

export async function writeForkLinkPair(
  input: ForkLinkWriteInput,
): Promise<ForkLinkWriteResult>;
```

Behavior:

1. Build both payloads from `input` (direction, other_session_id, other_session_slug, other_path).
2. Call `writeEventFile` on source dir with `timestamp: input.timestamp` and the `fork-link.json` filename.
3. Call `writeEventFile` on fork dir likewise.
4. On each successful write, invoke `publishEventWrite(bus, sessionId, ...)` (`packages/kernel/src/services/eventPublisher.ts:11`) so open windows on either session refresh via the existing `event_added` path (`App.tsx:362-383`).
5. Return per-side success/error. Never throws.

`other_path` is only populated when source's `Paths.root()` differs from fork's `Paths.root()`. For same-path forks (the common case), it stays undefined.

### 3.4 Fork route changes

`packages/kernel/src/routes/sessions.ts:285-427` (POST `/sessions/:id/fork`):

```ts
const T = isoTimestamp();
await ensureSystemForkParticipant(p); // preflight
const fork = await forkSessionFolder(p, {...});  // unchanged
// ... existing path bookkeeping ...
const linkResults = await writeForkLinkPair({
  sourceP: p,
  forkP: p, // same path in v1; widen when cross-path forks land
  sourceSessionId, forkSessionId: fork.session.id,
  sourceSlug: deriveSlug(sourceSessionId),
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
// agent rebind (existing native-fork plan applies here)
// ... unchanged ...
return {
  source_session_id: sourceSessionId,
  session,
  copied_entries: fork.copied_entries,
  agents,
  warnings: [...warnings, ...linkWarnings],
};
```

**Critical**: link-write failures DO NOT promote to HTTP 400. The fork directory is canonical once `forkSessionFolder` returns; the link events are durable UX markers (Codex critique #1, adjustment #4).

The existing `bus.publish({ type: "session.forked", ... })` broadcast stays as-is.

## 4. Renderer integration

### 4.1 EventCard dispatcher

`packages/renderer/src/cards/EventCard.tsx`:

```tsx
if (event.kind === "fork-link") {
  return <ForkLinkCard event={event as ForkLinkEventRecord} />;
}
```

### 4.2 ForkLinkCard component

New `packages/renderer/src/cards/ForkLinkCard.tsx`:

```tsx
export function ForkLinkCard({ event }: { event: ForkLinkEventRecord }): JSX.Element {
  const sessions = useStore((s) => s.sessions);
  const activePath = useStore((s) => s.activePath);
  const setCurrentSession = useStore((s) => s.setCurrentSession);
  const token = useStore((s) => s.token);
  // ... refresh setters for cross-path switch ...
  const { direction, other_session_id, other_session_slug, other_path } = event.payload;
  const label = direction === "from" ? "Forked from" : "Forked to";

  async function onClick(): Promise<void> {
    if (other_path !== undefined && other_path !== activePath) {
      const client = createClient({ baseUrl: "", token });
      await client.setActivePath(other_path);
      // refresh sessions/participants per Sessions.tsx:187-213 pattern
    }
    setCurrentSession(other_session_id);
  }

  return (
    <button type="button" className="fork-link-card" onClick={() => void onClick()}>
      <GitFork size={14} aria-hidden />
      <span className="fork-link-label">{label}</span>
      <span className="fork-link-slug">{other_session_slug}</span>
    </button>
  );
}
```

### 4.3 Visual style

Quiet inline system row, lower contrast than prose. CSS class `.fork-link-card`:

- `display: inline-flex`, gap, padding ~ `4px 10px`
- `border: 1px solid var(--border-subtle)`, `border-radius: 6px`
- `background: var(--surface-1)` (no warning colors)
- `color: var(--ink-2)` for label, `var(--ink-1)` for slug
- Hover: subtle bg lift; Focus: visible focus ring
- `font-size: 12px`, mono optional
- NO participant stripe, NO timestamp surface by default (timestamp encoded in filename and available via tooltip if desired later)
- Icon: `GitFork` from lucide-react

Closer to `TurnEndDivider` visual weight than `AccessRequestCard`.

### 4.4 aggregate.ts

`packages/renderer/src/state/aggregate.ts:231-244` (`feedConversation`) whitelists conversation-relevant kinds. Add `"fork-link"` so the card appears in Conversation view as well as Everything. Document view (`feedDocument`) intentionally strips system noise — leave fork-link OUT of document view.

### 4.5 RightLog + log filter

- `packages/renderer/src/panels/right/RightLog.tsx`: add `"fork-link"` to `KIND_ICON` (use `GitFork`) and `KIND_LABEL` (`"Fork"`).
- `packages/renderer/src/popovers/log-filter-types.ts`: add `"fork-link"` to the filter kind list with a sensible default-on state.

## 5. Anchor-seeding rule (generic, not fork-specific)

### 5.1 Where it lives

`packages/renderer/src/shell/Feed.tsx` — extend the existing restore effect at lines 132-147:

```tsx
useEffect(() => {
  if (currentSessionId === null) return;
  if (items.length === 0) return;
  if (restoredSessionRef.current === currentSessionId) return;
  restoredSessionRef.current = currentSessionId;
  const root = scrollRef.current;
  if (root === null) return;
  programmaticUntilRef.current = Date.now() + PROGRAMMATIC_SCROLL_MS;

  if (savedAnchor === undefined) {
    // First-open rule: seed to latest, scroll to bottom, follow.
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
}, [currentSessionId, items.length, savedAnchor, itemKey, markSeen, setFollowMode]);
```

Notes:

- `restoredSessionRef.current = currentSessionId` is set unconditionally at the top, so a session is "restored" exactly once even if items arrive in two batches.
- The store's `markSeen` already guards against moving the anchor backward (`store.ts:729-737`), so this is safe even if items shift later.
- `programmaticUntilRef` is bumped so the scroll-handler doesn't immediately flip follow mode off.

### 5.2 Interaction with the new fork-link event

The fork's `fork-link(from)` event lands at the moment of fork — i.e., it IS the highest-sorting filename in the fork. Seeding the anchor to that filename means the card itself is marked as "read" too — exactly the user's "fork opens with everything read" intent.

## 6. ForkSessionPopover

`packages/renderer/src/components/ForkSessionPopover.tsx` already calls `setCurrentSession(response.session.id)` after refreshing state. No changes needed — once the fork dir + events exist, navigating to it triggers §5 which handles the rest.

## 7. Bus / WebSocket

No new bus messages. The existing `event_added` broadcast (emitted by `writeForkLinkPair` per §3.3) drives source-window live updates. The existing `session.forked` broadcast is unaffected (it remains a no-op in `App.tsx:358-360`, which is fine — its only purpose is informing other panels that the session list changed).

## 8. Tests

### 8.1 Kernel route tests (`packages/kernel/tests/routes/sessions.test.ts`)

- `POST /sessions/:id/fork` writes exactly one `fork-link(direction:"to")` into the source events dir, with payload `{ other_session_id: <fork-id>, other_session_slug: <fork-slug> }`.
- Same call writes exactly one `fork-link(direction:"from")` into the fork events dir, with payload `{ other_session_id: <source-id>, other_session_slug: <source-slug> }`.
- The source's fork-link event is NOT copied into the fork dir.
- `sys-fork` participant exists in `.f-mark/participants.json` after the call, with `kind: "sys"`.
- Calling fork twice from the same source does NOT duplicate `sys-fork`.
- `.fork.json` is still written (regression guard).
- When `bus` is set, two `event_added` messages are published (one per session_id).
- Forced link-write failure (e.g., simulate `writeEventFile` rejection) returns HTTP 200 with `warnings` non-empty — fork directory still exists.

### 8.2 Concurrent fork

- Two fork calls from the same source initiated in the same millisecond both succeed; each produces its own source-side fork-link event with distinct filenames (collision-bump loop verified).

### 8.3 Renderer Feed test

- New session loaded with `lastSeenBySession[sid]` undefined and 3 events → after restore effect runs, `lastSeenBySession[sid]` equals the highest filename, no unread floater visible, scroll position at bottom.
- Existing behavior (saved anchor + scroll-to-center) preserved when anchor is set.

### 8.4 ForkLinkCard click test

- Same-path: click → `setCurrentSession(other_session_id)`, no `setActivePath` call.
- Cross-path: click → `setActivePath(other_path)` called first, then `setCurrentSession`.

## 9. File-by-file change list

**Modified:**

1. `packages/shared/src/events.ts` — add `EventKind` member, `ForkLinkPayload`, `ForkLinkEventRecord`, extend `AnyEventRecord`.
2. `packages/kernel/src/project.ts` — widen `Participant.kind`.
3. `packages/kernel/src/participants.ts` — `SYS_FORK_PARTICIPANT_ID`, `ensureSystemForkParticipant`.
4. `packages/kernel/src/events/writer.ts` — `WriteEventInput.timestamp` optional input.
5. `packages/kernel/src/routes/sessions.ts` — preflight `sys-fork`, call `writeForkLinkPair`, demote link errors to warnings.
6. `packages/renderer/src/cards/EventCard.tsx` — dispatch new kind.
7. `packages/renderer/src/cards/cards.css` — `.fork-link-card` styles.
8. `packages/renderer/src/state/aggregate.ts` — whitelist in `feedConversation`.
9. `packages/renderer/src/shell/Feed.tsx` — extend restore effect.
10. `packages/renderer/src/panels/right/RightLog.tsx` — `KIND_ICON`, `KIND_LABEL` entries.
11. `packages/renderer/src/popovers/log-filter-types.ts` — filter kind list.

**New:**

12. `packages/kernel/src/services/forkLinkWriter.ts` — `writeForkLinkPair`.
13. `packages/renderer/src/cards/ForkLinkCard.tsx` — UI component.
14. `packages/kernel/tests/routes/forkLinks.test.ts` (or extend `sessions.test.ts`) — kernel test surface.
15. `packages/renderer/src/shell/Feed.firstOpen.test.tsx` (or extend an existing Feed test) — first-open seed test.

## 10. Failure invariants

- `forkSessionFolder` succeeds → fork is **canonical**. The HTTP response is 200 regardless of link-write outcomes.
- Either link-write failure → response includes `warnings`. The system is left in a self-consistent state: source may have its link event, fork may have its link event, neither may have it, or both. No state requires compensation.
- The `sys-fork` participant is created once per project path, idempotently.
- A `fork-link` event is never copied across sessions: the copy completes BEFORE either write.
- `markSeen` is monotonic; the §5 seed rule can never regress an already-saved anchor.

## 11. Out of scope

- Backfill: legacy `.fork.json`-only sessions remain card-less.
- Multi-fork tracking UI (e.g., "this session has 3 forks" badge): future.
- Per-fork participant attribution: the `sys-fork` system participant is the only author; we don't record who clicked "Fork".
- Renaming a fork after creation: out of scope.
