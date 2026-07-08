import type { JSX, ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { basename } from "./allSessions.js";

interface Props {
  children: ReactNode;
  count: number;
  path: string;
}

export function RepoSessionGroup({ children, count, path }: Props): JSX.Element {
  return (
    <details key={path} className="repo-session-group" open>
      <summary className="repo-session-summary">
        <ChevronDown
          size={13}
          aria-hidden="true"
          className="repo-session-chevron"
        />
        <span className="repo-session-title">{basename(path)}</span>
        <span className="repo-session-count">{count}</span>
        <span className="repo-session-path" title={path}>
          {path}
        </span>
      </summary>
      {children}
    </details>
  );
}
