/* FolderPicker — kernel-served folder navigator used by NewSessionModal.
   Rendered inline inside the parent modal (no second backdrop) when the
   user clicks "Browse…". Calls /fs/list to enumerate subdirectories of
   the currently-shown path; arrow keys move selection, Enter descends,
   "Use this folder" returns the *currently-shown* directory to the parent
   via onPick.

   Favorites are deferred to a follow-up: this picker exposes the minimal
   surface (browse + pick) the session-create flow needs today. */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
  type KeyboardEvent,
} from "react";
import { ChevronRight, FolderClosed, Star, X } from "lucide-react";
import { createClient, type FsListEntry } from "../../api/client.js";
import { useStore } from "../../state/store.js";

export interface FolderPickerProps {
  /** Starting absolute path. If null/empty, fetches /fs/home and starts there. */
  initialPath: string | null;
  /** Called with the absolute path of the folder the user accepted (the
      "Use this folder" action). Omitted when `hideActions` is set. */
  onPick?(path: string): void;
  /** Cancel back to the parent UI without picking. */
  onCancel?(): void;
  /** Hide the Cancel / "Use this folder" footer actions while keeping the
      current-path readout. The shown directory becomes the live selection,
      reported via `onPathChange` — used by the onboarding wizard, whose own
      Back/Next footer drives navigation. */
  hideActions?: boolean;
  /** Fired whenever the shown directory changes (including the first load) so a
      parent can treat the current dir as the selection without a button. */
  onPathChange?(path: string): void;
}

interface ListState {
  status: "loading" | "ready" | "error";
  path: string;
  parent: string | null;
  entries: FsListEntry[];
  error: string | null;
  truncated: boolean;
}

const LOADING: ListState = {
  status: "loading",
  path: "",
  parent: null,
  entries: [],
  error: null,
  truncated: false,
};

function splitBreadcrumbs(absPath: string): string[] {
  if (absPath === "/" || absPath === "") return [];
  return absPath.split("/").filter((s) => s.length > 0);
}

function joinAt(crumbs: string[], idx: number): string {
  if (idx < 0) return "/";
  return "/" + crumbs.slice(0, idx + 1).join("/");
}

export function FolderPicker(props: FolderPickerProps): JSX.Element {
  const token = useStore((s) => s.token);
  const favorites = useStore((s) => s.favorites) ?? [];
  const setFavorites = useStore((s) => s.setFavorites);
  const client = useMemo(() => createClient({ baseUrl: "", token }), [token]);
  const [state, setState] = useState<ListState>(LOADING);
  const [focusedIdx, setFocusedIdx] = useState<number>(-1);
  const [savePromptOpen, setSavePromptOpen] = useState(false);
  const [favName, setFavName] = useState("");
  const [favError, setFavError] = useState<string | null>(null);
  const [savingFav, setSavingFav] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(
    async (target: string): Promise<void> => {
      setState((prev) => ({ ...prev, status: "loading", error: null }));
      try {
        const data = await client.fsList(target);
        setState({
          status: "ready",
          path: data.path,
          parent: data.parent,
          entries: data.entries,
          error: null,
          truncated: data.truncated,
        });
        setFocusedIdx(data.entries.length > 0 ? 0 : -1);
        // Report the now-shown directory so a footerless parent can treat it as
        // the live selection. Parents must pass a stable callback (the picker's
        // loader is memoized and captures it once).
        props.onPathChange?.(data.path);
      } catch (err) {
        setState({
          status: "error",
          path: target,
          parent: null,
          entries: [],
          error: err instanceof Error ? err.message : String(err),
          truncated: false,
        });
      }
    },
    [client],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let start = props.initialPath;
      if (start === null || start.length === 0) {
        try {
          const home = await client.fsHome();
          if (cancelled) return;
          start = home.home;
        } catch {
          start = "/";
        }
      }
      if (!cancelled) await load(start);
    })();
    return () => { cancelled = true; };
  }, [props.initialPath, client, load]);

  const crumbs = splitBreadcrumbs(state.path);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (state.status !== "ready") return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusedIdx((i) => Math.min(state.entries.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusedIdx((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (e.metaKey || e.ctrlKey) {
        props.onPick?.(state.path);
      } else if (focusedIdx >= 0 && focusedIdx < state.entries.length) {
        const target = `${state.path === "/" ? "" : state.path}/${state.entries[focusedIdx]!.name}`;
        void load(target);
      }
    } else if (e.key === "Backspace" && state.parent !== null) {
      e.preventDefault();
      void load(state.parent);
    }
  };

  // Ensure the focused row is visible. (Guard for jsdom — scrollIntoView
  // is undefined in the test environment.)
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-row-idx='${focusedIdx}']`,
    );
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ block: "nearest" });
    }
  }, [focusedIdx]);

  const saveCurrentAsFavorite = useCallback(
    async (name: string): Promise<void> => {
      if (savingFav) return;
      const trimmed = name.trim();
      if (trimmed.length === 0) {
        setFavError("Name required");
        return;
      }
      setSavingFav(true);
      setFavError(null);
      try {
        const res = await client.addFavorite({ name: trimmed, path: state.path });
        setFavorites(res.favorites);
        setSavePromptOpen(false);
        setFavName("");
      } catch (e) {
        setFavError(e instanceof Error ? e.message : String(e));
      } finally {
        setSavingFav(false);
      }
    },
    [client, state.path, setFavorites, savingFav],
  );

  const removeFavorite = useCallback(
    async (path: string): Promise<void> => {
      try {
        const res = await client.removeFavorite(path);
        setFavorites(res.favorites);
      } catch {
        /* keep silent — user just sees the chip stay */
      }
    },
    [client, setFavorites],
  );

  const currentIsFavorited = useMemo(
    () => favorites.some((f) => f.path === state.path),
    [favorites, state.path],
  );

  return (
    <div
      className="folder-picker"
      role="dialog"
      aria-label="Pick a folder"
      tabIndex={0}
      onKeyDown={onKeyDown}
    >
      <div className="folder-picker-favorites" aria-label="Favorites">
        {favorites.map((f) => (
          <span key={f.path} className="folder-picker-fav-chip">
            <button
              type="button"
              className="folder-picker-fav-jump"
              onClick={() => void load(f.path)}
              title={f.path}
            >
              <Star size={10} aria-hidden />
              {f.name}
            </button>
            <button
              type="button"
              className="folder-picker-fav-remove"
              onClick={() => void removeFavorite(f.path)}
              aria-label={`Remove favorite ${f.name}`}
              title="Remove from favorites"
            >
              <X size={10} aria-hidden />
            </button>
          </span>
        ))}
        {!currentIsFavorited && state.status === "ready" && (
          <button
            type="button"
            className="folder-picker-fav-add"
            onClick={() => {
              setSavePromptOpen(true);
              setFavError(null);
            }}
          >
            + Save current as favorite
          </button>
        )}
      </div>

      {savePromptOpen && (
        <div className="folder-picker-fav-prompt" role="dialog" aria-label="Save favorite">
          <input
            className="form-input"
            placeholder="Name this folder (e.g. F-Mark dev)"
            value={favName}
            autoFocus
            aria-label="Favorite name"
            onChange={(e) => setFavName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                e.stopPropagation();
                void saveCurrentAsFavorite(favName);
              } else if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                setSavePromptOpen(false);
                setFavName("");
                setFavError(null);
              }
            }}
          />
          <button
            type="button"
            className="btn-solid"
            disabled={savingFav || favName.trim().length === 0}
            onClick={() => void saveCurrentAsFavorite(favName)}
          >
            {savingFav ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              setSavePromptOpen(false);
              setFavName("");
              setFavError(null);
            }}
          >
            Cancel
          </button>
          {favError !== null && (
            <div className="form-error" role="alert">
              {favError}
            </div>
          )}
        </div>
      )}

      <div className="folder-picker-breadcrumbs" aria-label="Breadcrumbs">
        <button
          type="button"
          className="crumb"
          onClick={() => void load("/")}
        >
          /
        </button>
        {crumbs.map((seg, i) => (
          <span key={`${seg}-${i}`} className="crumb-row">
            <ChevronRight size={12} className="crumb-sep" aria-hidden />
            <button
              type="button"
              className="crumb"
              onClick={() => void load(joinAt(crumbs, i))}
            >
              {seg}
            </button>
          </span>
        ))}
      </div>

      <div className="folder-picker-list" ref={listRef} role="listbox" aria-label="Subdirectories">
        {state.status === "loading" && (
          <div className="folder-picker-status">Loading…</div>
        )}
        {state.status === "error" && (
          <div className="folder-picker-status folder-picker-error" role="alert">
            {state.error}
          </div>
        )}
        {state.status === "ready" && state.entries.length === 0 && (
          <div className="folder-picker-status folder-picker-empty">
            No subdirectories.
          </div>
        )}
        {state.status === "ready" &&
          state.entries.map((e, i) => (
            <button
              key={e.name}
              type="button"
              role="option"
              aria-selected={i === focusedIdx}
              data-row-idx={i}
              className={`folder-picker-row${i === focusedIdx ? " on" : ""}`}
              onClick={() => {
                setFocusedIdx(i);
                const target = `${state.path === "/" ? "" : state.path}/${e.name}`;
                void load(target);
              }}
            >
              <FolderClosed size={14} aria-hidden className="folder-icon" />
              <span>{e.name}</span>
            </button>
          ))}
        {state.truncated && (
          <div className="folder-picker-status">… listing truncated.</div>
        )}
      </div>

      <div className="folder-picker-foot">
        <div className="folder-picker-current" title={state.path}>
          {state.path || "—"}
        </div>
        {props.hideActions !== true ? (
          <div className="folder-picker-actions">
            <button type="button" className="btn-ghost" onClick={props.onCancel}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-solid"
              disabled={state.status !== "ready"}
              onClick={() => props.onPick?.(state.path)}
            >
              Use this folder
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
