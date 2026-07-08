import type { JSX, ReactNode } from "react";
import { LoadingAnimation } from "../components/LoadingAnimation.js";

interface Props {
  ariaLabel: string;
  children: ReactNode;
  emptyMessage?: string;
  error: string | null;
  loading: boolean;
  showEmpty?: boolean;
  title: string;
}

export function AllSessionsPanelShell({
  ariaLabel,
  children,
  emptyMessage,
  error,
  loading,
  showEmpty = false,
  title,
}: Props): JSX.Element {
  return (
    <aside className="left-panel" role="tabpanel" aria-label={ariaLabel}>
      <div
        className="panel-head"
        style={{ flexDirection: "column", alignItems: "flex-start", gap: 0 }}
      >
        <h3>{title}</h3>
        <div className="scope">
          across <b>all sessions</b>
        </div>
      </div>
      <div className="panel-list" style={{ padding: "0 12px 12px" }}>
        {error !== null ? <p className="panel-error">{error}</p> : null}
        {loading ? <LoadingAnimation className="panel-loading" /> : null}
        {!loading && error === null && showEmpty && emptyMessage !== undefined ? (
          <p className="panel-empty">{emptyMessage}</p>
        ) : null}
        {children}
      </div>
    </aside>
  );
}
