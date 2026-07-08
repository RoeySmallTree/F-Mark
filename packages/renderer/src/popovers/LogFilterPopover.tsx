/* LogFilterPopover — the Activity-log filter UI. Local state until the
   user clicks Apply, then a single LogFilter snapshot is emitted via the
   onApply callback. The parent (RightLog) holds the applied filter; we
   only own the draft. Reset returns the draft to DEFAULT_FILTER but does
   not clear the parent's applied filter until Apply is clicked. */

import { useMemo, useState } from "react";
import type { Participant } from "@f-mark/shared";
import { Popover } from "./Popover.js";
import { DateRangeSection } from "./logFilterPopover/DateRangeSection.js";
import { FilterFooter } from "./logFilterPopover/FilterFooter.js";
import { KindsSection } from "./logFilterPopover/KindsSection.js";
import { NamedOnlySection } from "./logFilterPopover/NamedOnlySection.js";
import { ParticipantsSection } from "./logFilterPopover/ParticipantsSection.js";
import { DEFAULT_FILTER, type LogFilter } from "./log-filter-types.js";

interface Props {
  anchorRect: DOMRect | null;
  initial: LogFilter;
  participants: Record<string, Participant>;
  onApply(filter: LogFilter): void;
  onClose(): void;
}

export function LogFilterPopover({
  anchorRect,
  initial,
  participants,
  onApply,
  onClose,
}: Props): JSX.Element {
  const [draft, setDraft] = useState<LogFilter>(() => ({ ...initial }));

  const participantEntries = useMemo(
    () => Object.entries(participants),
    [participants],
  );

  function reset(): void {
    setDraft({ ...DEFAULT_FILTER });
  }

  function apply(): void {
    onApply({ ...draft });
    onClose();
  }

  return (
    <Popover
      anchorRect={anchorRect}
      onClose={onClose}
      className="log-filter-popover"
      ariaLabel="Filter activity log"
    >
      <div className="pop-head">Filter activity</div>
      <KindsSection draft={draft} setDraft={setDraft} />
      <ParticipantsSection
        draft={draft}
        participants={participantEntries}
        setDraft={setDraft}
      />
      <DateRangeSection draft={draft} setDraft={setDraft} />
      <NamedOnlySection draft={draft} setDraft={setDraft} />
      <FilterFooter onApply={apply} onReset={reset} />
    </Popover>
  );
}
