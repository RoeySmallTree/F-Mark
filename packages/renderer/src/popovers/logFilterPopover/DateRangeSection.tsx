import type { LogFilter } from "../log-filter-types.js";
import { RANGE_OPTIONS, type SetLogFilterDraft } from "./model.js";

const NO_LOOSE_STRING_VALUES = {
  custom: "custom",
} as const;

interface DateRangeSectionProps {
  draft: LogFilter;
  setDraft: SetLogFilterDraft;
}

export function DateRangeSection({
  draft,
  setDraft,
}: DateRangeSectionProps): JSX.Element {
  return (
    <div className="pop-section">
      <div className="pop-label">Date range</div>
      <div className="seg-control" role="group" aria-label="Date range">
        {RANGE_OPTIONS.map((opt) => (
          <button
            type="button"
            key={opt.id}
            aria-pressed={draft.range === opt.id}
            className={draft.range === opt.id ? "on" : ""}
            onClick={() => setDraft((d) => ({ ...d, range: opt.id }))}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {draft.range === NO_LOOSE_STRING_VALUES.custom && (
        <CustomDateRangeInputs draft={draft} setDraft={setDraft} />
      )}
    </div>
  );
}

function CustomDateRangeInputs({
  draft,
  setDraft,
}: DateRangeSectionProps): JSX.Element {
  return (
    <div className="pop-date-row">
      <input
        type="datetime-local"
        aria-label="Custom start"
        value={draft.customStart ?? ""}
        onChange={(e) =>
          setDraft((d) => ({ ...d, customStart: e.target.value }))
        }
      />
      <input
        type="datetime-local"
        aria-label="Custom end"
        value={draft.customEnd ?? ""}
        onChange={(e) => setDraft((d) => ({ ...d, customEnd: e.target.value }))}
      />
    </div>
  );
}
