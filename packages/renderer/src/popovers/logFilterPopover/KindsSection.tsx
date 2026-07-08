import {
  FILTERABLE_KINDS,
  type LogFilter,
} from "../log-filter-types.js";
import { FilterChip } from "./FilterChip.js";
import { toggleString, type SetLogFilterDraft } from "./model.js";

interface KindsSectionProps {
  draft: LogFilter;
  setDraft: SetLogFilterDraft;
}

export function KindsSection({
  draft,
  setDraft,
}: KindsSectionProps): JSX.Element {
  return (
    <div className="pop-section">
      <div className="pop-label">Kinds</div>
      <div className="pop-chips" role="group" aria-label="Filter by kind">
        {FILTERABLE_KINDS.map((kind) => (
          <FilterChip
            key={kind}
            checked={draft.kinds.includes(kind)}
            label={kind}
            onToggle={() =>
              setDraft((d) => ({ ...d, kinds: toggleString(d.kinds, kind) }))
            }
          />
        ))}
      </div>
    </div>
  );
}
