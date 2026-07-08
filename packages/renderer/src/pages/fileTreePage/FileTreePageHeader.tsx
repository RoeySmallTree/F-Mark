import type { RefObject } from "react";
import type { SessionMeta } from "@f-mark/shared";
import { ChevronDown, ExternalLink, FolderClosed } from "lucide-react";
import { basename } from "./session.js";

const NO_LOOSE_STRING_VALUES = {
  session: "session",
} as const;

interface FileTreePageHeaderProps {
  allSessions: SessionMeta[];
  currentSessionId: string | null;
  activePath: string | null;
  activePathId: string | null;
  dropdownOpen: boolean;
  dropdownRef: RefObject<HTMLDivElement>;
  promoteBusy: boolean;
  promoteError: string | null;
  onToggleDropdown(): void;
  onSwitchToSession(session: SessionMeta): void;
  onMakeActiveProject(): Promise<void>;
}

export function FileTreePageHeader({
  allSessions,
  currentSessionId,
  activePath,
  activePathId,
  dropdownOpen,
  dropdownRef,
  promoteBusy,
  promoteError,
  onToggleDropdown,
  onSwitchToSession,
  onMakeActiveProject,
}: FileTreePageHeaderProps): JSX.Element {
  const currentSession = allSessions.find((s) => s.id === currentSessionId);

  return (
    <header className="file-tree-page-head">
      <div className="file-tree-page-title">
        <FolderClosed size={15} aria-hidden />
        <span>{activePath !== null ? basename(activePath) : "—"}</span>
      </div>
      <div ref={dropdownRef} className="file-tree-page-sessions">
        <button
          type="button"
          className="file-tree-page-session-trigger"
          onClick={onToggleDropdown}
          aria-haspopup="listbox"
          aria-expanded={dropdownOpen}
        >
          <span>
            {currentSession !== undefined
              ? currentSession.slug
              : (currentSessionId ?? NO_LOOSE_STRING_VALUES.session)}
          </span>
          <ChevronDown size={14} aria-hidden />
        </button>
        {dropdownOpen ? (
          <ul className="file-tree-page-session-menu" role="listbox">
            {allSessions.map((session) => (
              <li key={`${session.path_id ?? ""}:${session.id}`}>
                <button
                  type="button"
                  role="option"
                  aria-selected={
                    session.id === currentSessionId &&
                    session.path_id === activePathId
                  }
                  className={
                    session.id === currentSessionId &&
                    session.path_id === activePathId
                      ? "is-active"
                      : ""
                  }
                  onClick={() => onSwitchToSession(session)}
                >
                  <span className="file-tree-page-session-slug">
                    {session.slug}
                  </span>
                  {session.path !== undefined ? (
                    <span className="file-tree-page-session-path">
                      {basename(session.path)}
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <div className="file-tree-page-actions">
        {promoteError !== null ? (
          <span className="file-tree-page-error-inline">{promoteError}</span>
        ) : null}
        <button
          type="button"
          className="file-tree-page-promote"
          onClick={() => void onMakeActiveProject()}
          disabled={promoteBusy || activePath === null}
          title="Switch every F-Mark tab to this project"
        >
          <ExternalLink size={13} aria-hidden /> Make active project
        </button>
      </div>
    </header>
  );
}
