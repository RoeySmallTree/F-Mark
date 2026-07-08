import { type JSX } from "react";
import { ChevronDown } from "lucide-react";
import { basename } from "../allSessions.js";
import type { SearchPathGroup, SearchSessionGroup } from "./types.js";

const NO_LOOSE_STRING_VALUES = {
  i: "--i",
} as const;

interface SearchResultsProps {
  groups: SearchPathGroup[];
}

export function SearchResults({ groups }: SearchResultsProps): JSX.Element {
  return (
    <>
      {groups.map((pathGroup) => (
        <details key={pathGroup.key} className="repo-session-group" open>
          <SearchPathSummary pathGroup={pathGroup} />
          {pathGroup.sessions.map((group) => (
            <SearchSessionResults key={group.key} group={group} />
          ))}
        </details>
      ))}
    </>
  );
}

function SearchPathSummary({
  pathGroup,
}: {
  pathGroup: SearchPathGroup;
}): JSX.Element {
  return (
    <summary className="repo-session-summary">
      <ChevronDown
        size={13}
        aria-hidden="true"
        className="repo-session-chevron"
      />
      <span className="repo-session-title">
        {pathGroup.path !== undefined ? basename(pathGroup.path) : "current repo"}
      </span>
      <span className="repo-session-count">
        {pathGroup.sessions.reduce(
          (count, sessionGroup) => count + sessionGroup.hits.length,
          0,
        )}
      </span>
      {pathGroup.path !== undefined ? (
        <span className="repo-session-path" title={pathGroup.path}>
          {pathGroup.path}
        </span>
      ) : null}
    </summary>
  );
}

function SearchSessionResults({
  group,
}: {
  group: SearchSessionGroup;
}): JSX.Element {
  return (
    <div className="repo-session-body">
      <div className="group-label">{group.session.toUpperCase()}</div>
      {group.hits.map((hit, index) => (
        <div
          key={`${hit.session_id}:${hit.event.filename}`}
          className="session-item staggered-row"
          style={{
            padding: "8px 10px",
            [NO_LOOSE_STRING_VALUES.i as string]: Math.min(index, 5),
          }}
        >
          <div className="row1">
            <span className="slug">{hit.event.kind}</span>
          </div>
          <div
            className="summary"
            style={{
              paddingLeft: 0,
              fontStyle: "italic",
              fontFamily: "var(--serif)",
            }}
          >
            {hit.snippet}
          </div>
        </div>
      ))}
    </div>
  );
}
