import { lazy, Suspense, type JSX } from "react";

/* TerminalView statically imports @xterm/xterm (~477 KB) + its CSS. The Terminal
   pane is routed statically by DockPaneContent, so the heavy view is lazy-loaded
   here to keep xterm out of the main bundle. Shared by the regular-terminals and
   agent-terminals views so they render identically. */
const TerminalView = lazy(() =>
  import("../../../components/terminalView/TerminalView.js").then((m) => ({
    default: m.TerminalView,
  })),
);

export interface TerminalBodiesProps {
  /** Ordered session ids that currently have a tab. */
  sessions: string[];
  /** The visible session, or null. */
  active: string | null;
  /** Sessions that have been activated at least once (keep-alive). */
  mountedSessions: string[];
  token: string | null;
}

/* Keep-alive stack: a TerminalView per activated session, only the active one
   visible (hidden via `visibility`, not `display:none`, so a hidden pane keeps
   measurable dimensions and never feeds a 0×0 size to its tmux pane). */
export function TerminalBodies({
  sessions,
  active,
  mountedSessions,
  token,
}: TerminalBodiesProps): JSX.Element {
  const mounted = new Set(mountedSessions);
  return (
    <div className="terminal-bodies">
      <Suspense fallback={null}>
        {sessions
          .filter((s) => mounted.has(s))
          .map((s) => {
            const isActive = s === active;
            return (
              <div
                key={s}
                className={`terminal-body-slot${isActive ? " active" : ""}`}
                aria-hidden={!isActive}
              >
                <TerminalView
                  tmuxSession={s}
                  token={token}
                  baseUrl=""
                  active={isActive}
                />
              </div>
            );
          })}
      </Suspense>
    </div>
  );
}
