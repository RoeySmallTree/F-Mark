/* PathSwitcher — sits in the TopBar, replaces the static "f-mark"
   breadcrumb segment. Shows the active path's basename (or "no path")
   and opens a dropdown listing favorites + recents. Clicking a path
   calls POST /paths/active and refetches sessions + participants.

   Favorites add/rename/remove will land in a follow-up; this rev only
   surfaces the existing entries and lets the user switch between them. */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
} from "react";
import { ChevronDown, FolderClosed, Star } from "lucide-react";
import { createClient, type PathFavorite } from "../api/client.js";
import { useStore } from "../state/store.js";

function basename(absPath: string | null | undefined): string {
  if (absPath === null || absPath === undefined || absPath.length === 0) {
    return "no path";
  }
  const trimmed = absPath.replace(/\/+$/, "");
  const slash = trimmed.lastIndexOf("/");
  if (slash < 0) return trimmed;
  return trimmed.slice(slash + 1) || trimmed;
}

export function PathSwitcher(): JSX.Element {
  const token = useStore((s) => s.token);
  const activePath = useStore((s) => s.activePath);
  // Tests (and any caller that resets the store without spreading defaults)
  // may leave these undefined; guard so the topbar never crashes.
  const knownPaths = useStore((s) => s.knownPaths) ?? [];
  const favorites = useStore((s) => s.favorites) ?? [];
  const setPathsState = useStore((s) => s.setPathsState);
  const setSessions = useStore((s) => s.setSessions);
  const setParticipants = useStore((s) => s.setParticipants);
  const setCurrentSession = useStore((s) => s.setCurrentSession);

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const client = useMemo(() => createClient({ baseUrl: "", token }), [token]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent): void {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape" || e.key === "Esc") setOpen(false);
    }
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const switchTo = useCallback(
    async (target: string): Promise<void> => {
      if (busy) return;
      setBusy(true);
      setError(null);
      try {
        const next = await client.setActivePath(target);
        setPathsState(next);
        // Refetch session-scoped state for the new path.
        const [list, participants] = await Promise.all([
          client.listSessions(),
          client.listParticipants(),
        ]);
        setSessions(list);
        setParticipants(participants);
        setCurrentSession(list.length > 0 ? list[0]!.id : null);
        setOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [busy, client, setPathsState, setSessions, setParticipants, setCurrentSession],
  );

  // Recents = knownPaths minus favorites (favorites already show in their own group).
  const favSet = useMemo(
    () => new Set(favorites.map((f) => f.path)),
    [favorites],
  );
  const recents = useMemo(
    () => knownPaths.filter((p) => !favSet.has(p)),
    [knownPaths, favSet],
  );

  return (
    <div ref={rootRef} className="path-switcher">
      <button
        type="button"
        className="path-switcher-trigger"
        onClick={() => setOpen((v) => !v)}
        title={activePath ?? "no active path"}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <FolderClosed size={11} aria-hidden className="path-switcher-icon" />
        <span className="path-switcher-name">{basename(activePath)}</span>
        <ChevronDown size={11} aria-hidden className="path-switcher-caret" />
      </button>

      {open && (
        <div className="path-switcher-menu" role="menu">
          {activePath !== null && (
            <div className="path-switcher-current" title={activePath}>
              <span className="path-switcher-current-label">CURRENT</span>
              <span className="path-switcher-current-path">{activePath}</span>
            </div>
          )}

          {favorites.length > 0 && (
            <>
              <div className="path-switcher-group">FAVORITES</div>
              {favorites.map((f) => (
                <FavRow
                  key={f.path}
                  fav={f}
                  active={f.path === activePath}
                  disabled={busy}
                  onClick={() => void switchTo(f.path)}
                />
              ))}
            </>
          )}

          {recents.length > 0 && (
            <>
              <div className="path-switcher-group">RECENTS</div>
              {recents.map((p) => (
                <RecentRow
                  key={p}
                  path={p}
                  active={p === activePath}
                  disabled={busy}
                  onClick={() => void switchTo(p)}
                />
              ))}
            </>
          )}

          {favorites.length === 0 && recents.length === 0 && (
            <div className="path-switcher-empty">
              No other paths yet. Create a session in a different folder to
              start one.
            </div>
          )}

          {error !== null && (
            <div className="path-switcher-error" role="alert">
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FavRow(props: {
  fav: PathFavorite;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      className={`path-switcher-row${props.active ? " on" : ""}`}
      role="menuitem"
      disabled={props.disabled}
      onClick={props.onClick}
      title={props.fav.path}
    >
      <Star size={11} aria-hidden className="path-switcher-row-star" />
      <span className="path-switcher-row-name">{props.fav.name}</span>
      <span className="path-switcher-row-path">{props.fav.path}</span>
    </button>
  );
}

function RecentRow(props: {
  path: string;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      className={`path-switcher-row${props.active ? " on" : ""}`}
      role="menuitem"
      disabled={props.disabled}
      onClick={props.onClick}
      title={props.path}
    >
      <FolderClosed
        size={11}
        aria-hidden
        className="path-switcher-row-folder"
      />
      <span className="path-switcher-row-name">{basename(props.path)}</span>
      <span className="path-switcher-row-path">{props.path}</span>
    </button>
  );
}
