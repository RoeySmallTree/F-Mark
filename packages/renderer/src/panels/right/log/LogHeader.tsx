import type { JSX, RefObject } from "react";
import { ChevronDown } from "lucide-react";

interface LogHeaderProps {
  buttonRef: RefObject<HTMLButtonElement>;
  eventCount: number;
  filterCount: number;
  popoverOpen: boolean;
  onToggleFilter(): void;
}

export function LogHeader({
  buttonRef,
  eventCount,
  filterCount,
  popoverOpen,
  onToggleFilter,
}: LogHeaderProps): JSX.Element {
  return (
    <div className="log-head">
      <span className="scope">{eventCount} events · oldest first</span>
      <button
        ref={buttonRef}
        type="button"
        className="log-filter-btn"
        onClick={onToggleFilter}
        aria-haspopup="dialog"
        aria-expanded={popoverOpen}
      >
        Filter
        {filterCount > 0 ? (
          <span className="filter-ct" aria-label={`${filterCount} active`}>
            {filterCount}
          </span>
        ) : null}
        <ChevronDown size={10} aria-hidden="true" />
      </button>
    </div>
  );
}
