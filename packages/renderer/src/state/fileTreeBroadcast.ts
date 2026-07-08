/* Standalone /file-tree tab-state synchronization via BroadcastChannel (X6).

   Multiple standalone /file-tree tabs can be open for the SAME (path_id,
   sessionId) — e.g. the user popped the same project's file tree out twice.
   This channel keeps those coherent: the active file, the per-tab diff mode,
   and the selected (path_id, sessionId) are broadcast so a sibling tab follows
   along.

   Hard rules (X6):
     • Keyed by (path_id, sessionId). A tab IGNORES any message whose
       (path_id, sessionId) differs from its OWN current selection — two
       standalone tabs on different roots/sessions must not interfere.
     • This NEVER switches the MAIN app's active project/session. The channel
       is consumed only by the standalone page (the main App does not mount the
       receiver), and even there it only mutates the per-tab in-memory store —
       it does not call setActivePath / kernel switches. "Make active project"
       remains the sole explicit promotion path.

   BroadcastChannel is same-origin and absent in jsdom; every entry point
   degrades to a no-op when it (or `window`) is unavailable. */

const FILE_TREE_CHANNEL = "fmark:within-files";

/** A coherence update for one (path_id, sessionId) standalone view. */
export interface FileTreeBroadcastMessage {
  /** Disambiguates roots when session ids collide (spec §6.1). May be null
   *  when the seeded session has no path_id. */
  pathId: string | null;
  sessionId: string;
  /** Absolute viewer path of the active file, or null when none is open. */
  activeFile: string | null;
  /** Per-tab diff mode for the active file (none / current-session /
   *  whole-branch). Omitted when no file is active. */
  diffMode?: "none" | "current-session" | "whole-branch";
  /** Origin tab id so a sender ignores its own echoes (BroadcastChannel does
   *  not deliver to the posting context, but this guards re-broadcast loops). */
  origin: string;
}

export interface FileTreeChannel {
  post(msg: Omit<FileTreeBroadcastMessage, "origin">): void;
  close(): void;
}

/** Random per-tab origin id (used to drop self-echoes). */
export function makeOriginId(): string {
  try {
    const c = (globalThis as { crypto?: Crypto }).crypto;
    if (c?.randomUUID !== undefined) return c.randomUUID();
  } catch {
    /* fall through */
  }
  return `ft-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

function hasBroadcastChannel(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof (window as { BroadcastChannel?: unknown }).BroadcastChannel ===
      "function"
  );
}

/** True when a received message targets the same (path_id, sessionId) as this
 *  tab AND did not originate here. Exported for unit tests. */
export function messageMatchesScope(
  msg: FileTreeBroadcastMessage,
  selfOrigin: string,
  pathId: string | null,
  sessionId: string | null,
): boolean {
  if (msg.origin === selfOrigin) return false;
  if (sessionId === null) return false;
  if (msg.sessionId !== sessionId) return false;
  /* path_id is the cross-root disambiguator: only follow a sibling on the
     exact same root. When EITHER side lacks a path_id we still require strict
     equality (null === null), so a path-id-less view never absorbs a path-id'd
     one and vice-versa. */
  return (msg.pathId ?? null) === (pathId ?? null);
}

/** Open the standalone tab-state channel. `onMessage` receives EVERY message;
 *  the caller filters by scope with `messageMatchesScope`. Returns a no-op
 *  channel when BroadcastChannel is unavailable (jsdom/SSR). */
export function openFileTreeChannel(
  origin: string,
  onMessage: (msg: FileTreeBroadcastMessage) => void,
): FileTreeChannel {
  if (!hasBroadcastChannel()) {
    return { post: () => {}, close: () => {} };
  }
  const bc = new BroadcastChannel(FILE_TREE_CHANNEL);
  bc.onmessage = (ev: MessageEvent): void => {
    const data = ev.data as FileTreeBroadcastMessage | null;
    if (data === null || typeof data !== "object") return;
    if (typeof data.sessionId !== "string" || typeof data.origin !== "string") {
      return;
    }
    onMessage(data);
  };
  return {
    post: (msg) => {
      try {
        bc.postMessage({ ...msg, origin });
      } catch {
        /* channel closed / cloning failed — ignore */
      }
    },
    close: () => {
      try {
        bc.close();
      } catch {
        /* already closed */
      }
    },
  };
}
