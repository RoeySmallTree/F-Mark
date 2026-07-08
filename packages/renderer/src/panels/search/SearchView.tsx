import { type JSX } from "react";
import { Search as SearchIcon } from "lucide-react";
import { LoadingAnimation } from "../../components/LoadingAnimation.js";
import { SearchResults } from "./SearchResults.js";
import type { SearchController } from "./types.js";

interface SearchViewProps {
  controller: SearchController;
}

export function SearchView({ controller }: SearchViewProps): JSX.Element {
  return (
    <aside className="left-panel" role="tabpanel" aria-label="Search panel">
      <div className="panel-head">
        <h3>SEARCH</h3>
      </div>
      <div className="panel-search">
        <SearchIcon
          size={12}
          aria-hidden="true"
          style={{ color: "var(--ink-4)" }}
        />
        <input
          placeholder="Search messages, files, todos..."
          value={controller.query}
          onChange={(event) => controller.setQuery(event.target.value)}
          aria-label="Search query"
        />
      </div>
      <div className="panel-list">
        <SearchStatus controller={controller} />
        <SearchResults groups={controller.pathHitGroups} />
      </div>
    </aside>
  );
}

function SearchStatus({
  controller,
}: SearchViewProps): JSX.Element | null {
  if (controller.error !== null) {
    return (
      <p
        style={{
          fontFamily: "var(--mono)",
          fontSize: 11,
          color: "var(--rose)",
          padding: "4px 8px",
        }}
      >
        {controller.error}
      </p>
    );
  }
  if (controller.busy) return <LoadingAnimation className="panel-loading" />;
  if (controller.query.trim().length === 0) {
    return (
      <p
        style={{
          fontFamily: "var(--serif)",
          fontStyle: "italic",
          color: "var(--ink-3)",
          fontSize: 13,
          padding: "10px 14px",
        }}
      >
        Type to search across sessions, named contributions, todos.
      </p>
    );
  }
  if (controller.hitCount === 0) {
    return (
      <p
        style={{
          fontFamily: "var(--serif)",
          fontStyle: "italic",
          color: "var(--ink-3)",
          fontSize: 13,
          padding: "4px 8px",
        }}
      >
        No results.
      </p>
    );
  }
  return null;
}
