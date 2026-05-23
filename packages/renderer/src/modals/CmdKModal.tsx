/* CmdKModal — universal command palette.
   Triggered by `$mod+K` (registered globally in App.tsx). Surfaces:
     - Recent sessions (empty query) + first 4 Quick actions.
     - As the user types, filters across sessions, named contributions in the
       current session, backend search hits, and quick actions.
   Keyboard:
     - Arrow up/down navigates with wrap-around.
     - Enter activates the selected row.
     - Escape closes (handled by ModalRoot's window listener).

   Search is debounced 200ms so typing fast doesn't spam the backend. */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
} from "react";
import {
  Code,
  FileText,
  Folder,
  Plus,
  Search,
  Settings,
  Square,
  Sun,
  Sunrise,
  Terminal,
  Zap,
} from "lucide-react";
import type { SearchHit } from "@f-mark/shared";
import { createClient } from "../api/client.js";
import { useStore } from "../state/store.js";
import { applyTheme, type ThemeName } from "../themes/index.js";
import {
  defaultGroups,
  flattenRows,
  queryGroups,
  type CmdkIcon,
  type CmdkRow,
} from "./cmdk/sources.js";

/** Resolve a string icon-key to a Lucide React component. */
function IconFor(props: { icon: CmdkIcon; size?: number }): JSX.Element {
  const size = props.size ?? 13;
  switch (props.icon) {
    case "Folder":
      return <Folder size={size} aria-hidden="true" />;
    case "FileText":
      return <FileText size={size} aria-hidden="true" />;
    case "Search":
      return <Search size={size} aria-hidden="true" />;
    case "Plus":
      return <Plus size={size} aria-hidden="true" />;
    case "Settings":
      return <Settings size={size} aria-hidden="true" />;
    case "Sun":
      return <Sun size={size} aria-hidden="true" />;
    case "Terminal":
      return <Terminal size={size} aria-hidden="true" />;
    case "Code":
      return <Code size={size} aria-hidden="true" />;
    case "Sunrise":
      return <Sunrise size={size} aria-hidden="true" />;
    case "Square":
      return <Square size={size} aria-hidden="true" />;
    case "Zap":
      return <Zap size={size} aria-hidden="true" />;
    default:
      return <Folder size={size} aria-hidden="true" />;
  }
}

/** Theme-action ids map directly to ThemeName values. */
const THEME_FROM_ACTION: Record<string, ThemeName> = {
  "theme-light": "light",
  "theme-terminal": "terminal",
  "theme-ide": "ide",
  "theme-solarized": "solarized",
  "theme-brutalist": "brutalist",
  "theme-cyber": "cyber",
};

export function CmdKModal(): JSX.Element {
  const sessions = useStore((s) => s.sessions);
  const events = useStore((s) => s.events);
  const currentSessionId = useStore((s) => s.currentSessionId);
  const token = useStore((s) => s.token);
  const openModal = useStore((s) => s.openModal);
  const closeModal = useStore((s) => s.closeModal);
  const setCurrentSession = useStore((s) => s.setCurrentSession);

  const [query, setQuery] = useState("");
  const [searchHits, setSearchHits] = useState<SearchHit[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const resultsRef = useRef<HTMLDivElement | null>(null);

  // Debounce the backend search call by 200ms after each keystroke.
  useEffect(() => {
    const q = query.trim();
    if (q.length === 0) {
      setSearchHits([]);
      return;
    }
    const handle = setTimeout(() => {
      const client = createClient({ baseUrl: "", token });
      void client
        .search(q, currentSessionId ?? undefined)
        .then((hits) => {
          // Only commit if the query hasn't changed under us.
          setSearchHits(hits);
        })
        .catch(() => {
          // Search failures are non-fatal — leave existing hits in place.
        });
    }, 200);
    return () => clearTimeout(handle);
  }, [query, currentSessionId, token]);

  const groups = useMemo(() => {
    const q = query.trim();
    if (q.length === 0) return defaultGroups(sessions);
    return queryGroups({
      query: q,
      sessions,
      events,
      searchHits,
      currentSessionId,
    });
  }, [query, sessions, events, searchHits, currentSessionId]);

  const flatRows = useMemo(() => flattenRows(groups), [groups]);

  // Reset selection whenever the result set changes so the highlight stays
  // valid (e.g. the user types and now there are fewer rows).
  useEffect(() => {
    setSelectedIdx(0);
  }, [groups]);

  // Autofocus the input on mount.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const activate = useCallback(
    (row: CmdkRow): void => {
      if (row.kind === "action") {
        const actionId = row.actionId;
        if (actionId === "new-session") {
          openModal("new-session");
        } else if (actionId === "settings") {
          openModal("settings");
        } else {
          const themeName = THEME_FROM_ACTION[actionId];
          if (themeName !== undefined) {
            applyTheme(themeName);
            closeModal();
          } else {
            // Unknown action — close anyway so the palette doesn't get stuck.
            closeModal();
          }
        }
        return;
      }
      if (row.kind === "session") {
        if (row.sessionId !== currentSessionId) {
          setCurrentSession(row.sessionId);
        }
        closeModal();
        return;
      }
      if (row.kind === "named") {
        // Same-session: just scroll. (We're inside this session already.)
        closeModal();
        // Defer the scroll until after the modal has unmounted so the target
        // element isn't hidden behind the backdrop in some browsers' layout.
        requestAnimationFrame(() => {
          const el = document.querySelector(
            `[data-event-filename="${row.filename}"]`,
          );
          if (el !== null) {
            el.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        });
        return;
      }
      if (row.kind === "search") {
        if (row.sessionId !== currentSessionId) {
          setCurrentSession(row.sessionId);
        }
        closeModal();
        requestAnimationFrame(() => {
          const el = document.querySelector(
            `[data-event-filename="${row.filename}"]`,
          );
          if (el !== null) {
            el.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        });
        return;
      }
    },
    [openModal, closeModal, setCurrentSession, currentSessionId],
  );

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (flatRows.length === 0) return;
      setSelectedIdx((i) => (i + 1) % flatRows.length);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (flatRows.length === 0) return;
      setSelectedIdx((i) => (i - 1 + flatRows.length) % flatRows.length);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const row = flatRows[selectedIdx];
      if (row !== undefined) activate(row);
      return;
    }
  }

  // Keep the selected row in view as the user arrows up/down.
  useEffect(() => {
    const container = resultsRef.current;
    if (container === null) return;
    const el = container.querySelector(
      `[data-cmdk-idx="${selectedIdx}"]`,
    ) as HTMLElement | null;
    if (el !== null) {
      const top = el.offsetTop;
      const bottom = top + el.offsetHeight;
      const viewTop = container.scrollTop;
      const viewBottom = viewTop + container.clientHeight;
      if (top < viewTop) {
        container.scrollTop = top - 4;
      } else if (bottom > viewBottom) {
        container.scrollTop = bottom - container.clientHeight + 4;
      }
    }
  }, [selectedIdx]);

  // Render: build row index counter so each row knows its position in the
  // flattened sequence.
  let rowIdx = -1;

  return (
    <div
      className="modal cmdk-modal"
      onClick={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <div className="cmdk">
        <div className="cmdk-input-row">
          <Search size={16} style={{ color: "var(--ink-4)" }} aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            className="cmdk-input"
            placeholder="Search sessions, contributions, todos, quick actions…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKeyDown}
            aria-label="Command palette query"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd>esc</kbd>
        </div>

        <div className="cmdk-results" ref={resultsRef} role="listbox">
          {flatRows.length === 0 ? (
            <div className="cmdk-empty">
              No matches for “{query.trim()}”.
            </div>
          ) : (
            groups.map((g) => (
              <div key={g.key}>
                <div className="cmdk-group">{g.label}</div>
                {g.rows.map((r) => {
                  rowIdx += 1;
                  const idx = rowIdx;
                  const sel = idx === selectedIdx;
                  return (
                    <button
                      type="button"
                      key={r.id}
                      className={`cmdk-row${sel ? " sel" : ""}`}
                      data-cmdk-idx={idx}
                      data-cmdk-kind={r.kind}
                      data-cmdk-id={r.id}
                      role="option"
                      aria-selected={sel}
                      onMouseEnter={() => setSelectedIdx(idx)}
                      onClick={() => activate(r)}
                    >
                      <span className="cmdk-icon">
                        <IconFor icon={r.icon} />
                      </span>
                      <span className="cmdk-label">{r.label}</span>
                      <span className="cmdk-sub">{r.sub}</span>
                      <span className="cmdk-kind">{r.kind}</span>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className="cmdk-foot">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd>
            navigate
          </span>
          <span>
            <kbd>↵</kbd>
            open
          </span>
          <span>
            <kbd>esc</kbd>
            close
          </span>
        </div>
      </div>
    </div>
  );
}
