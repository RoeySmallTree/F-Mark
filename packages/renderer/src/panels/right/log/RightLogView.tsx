import type { JSX } from "react";
import { LogFilterPopover } from "../../../popovers/LogFilterPopover.js";
import { TabEmptyState } from "../TabEmptyState.js";
import { ActiveLogFilterChips } from "./ActiveLogFilterChips.js";
import { LogEventList } from "./LogEventList.js";
import { LogHeader } from "./LogHeader.js";
import type { RightLogController } from "./useRightLogController.js";

const NO_LOOSE_STRING_VALUES = {
  log: "log",
  logFiltered: "log-filtered",
  logEmpty: "log-empty",
  rightLogEmpty: "right-log-empty",
} as const;

interface RightLogViewProps {
  controller: RightLogController;
}

export function RightLogView({
  controller,
}: RightLogViewProps): JSX.Element {
  const {
    buttonRef,
    events,
    filterController,
    filtered,
    participants,
    popoverAnchorRect,
    popoverOpen,
    actions,
  } = controller;

  return (
    <div className="right-log" data-testid="right-log">
      <LogHeader
        buttonRef={buttonRef}
        eventCount={filtered.length}
        filterCount={filterController.activeCount}
        popoverOpen={popoverOpen}
        onToggleFilter={actions.toggleFilter}
      />

      {filterController.hasAny ? (
        <ActiveLogFilterChips
          controller={filterController}
          participants={participants}
        />
      ) : null}

      {filtered.length === 0 ? (
        <TabEmptyState
          variant={
            events.length === 0
              ? NO_LOOSE_STRING_VALUES.log
              : NO_LOOSE_STRING_VALUES.logFiltered
          }
          fill
          className={NO_LOOSE_STRING_VALUES.logEmpty}
          testId={NO_LOOSE_STRING_VALUES.rightLogEmpty}
        />
      ) : (
        <LogEventList
          events={filtered}
          participants={participants}
          onJump={actions.jumpTo}
        />
      )}

      {popoverOpen ? (
        <LogFilterPopover
          anchorRect={popoverAnchorRect}
          initial={filterController.filter}
          participants={participants}
          onApply={actions.applyFilter}
          onClose={actions.closePopover}
        />
      ) : null}
    </div>
  );
}
