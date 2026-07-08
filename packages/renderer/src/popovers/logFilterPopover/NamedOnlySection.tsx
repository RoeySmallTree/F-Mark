import type { LogFilter } from "../log-filter-types.js";
import type { SetLogFilterDraft } from "./model.js";

interface NamedOnlySectionProps {
  draft: LogFilter;
  setDraft: SetLogFilterDraft;
}

export function NamedOnlySection({
  draft,
  setDraft,
}: NamedOnlySectionProps): JSX.Element {
  return (
    <div className="pop-section">
      <label className="pop-toggle">
        <input
          type="checkbox"
          checked={draft.namedOnly}
          onChange={(e) =>
            setDraft((d) => ({ ...d, namedOnly: e.target.checked }))
          }
        />
        Named only
        <NamedOnlyHint />
      </label>
    </div>
  );
}

function NamedOnlyHint(): JSX.Element {
  return (
    <span
      style={{
        fontFamily: "var(--mono)",
        fontSize: 10.5,
        color: "var(--ink-4)",
        marginLeft: 6,
      }}
    >
      (prose with a name set)
    </span>
  );
}
