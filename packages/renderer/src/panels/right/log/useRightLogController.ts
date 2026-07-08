import { useMemo, useRef, type RefObject } from "react";
import type { AnyEventRecord, Participant } from "@f-mark/shared";
import {
  applyFilter as applyLogFilter,
  type LogFilter,
} from "../../../popovers/log-filter-types.js";
import { useStore } from "../../../state/store.js";
import { LogFilterController } from "./logFilterController.js";
import { jumpToLogEvent } from "./logScroll.js";

const NO_LOOSE_STRING_VALUES = {
  logFilter: "log-filter",
} as const;

interface RightLogActions {
  applyFilter(filter: LogFilter): void;
  closePopover(): void;
  jumpTo(filename: string): void;
  toggleFilter(): void;
}

export interface RightLogController {
  actions: RightLogActions;
  buttonRef: RefObject<HTMLButtonElement>;
  events: AnyEventRecord[];
  filterController: LogFilterController;
  filtered: AnyEventRecord[];
  participants: Record<string, Participant>;
  popoverAnchorRect: DOMRect | null;
  popoverOpen: boolean;
}

export function useRightLogController(): RightLogController {
  const events = useStore((state) => state.events);
  const participants = useStore((state) => state.participants);
  const activePopover = useStore((state) => state.activePopover);
  const openPopover = useStore((state) => state.openPopover);
  const closePopover = useStore((state) => state.closePopover);
  const filter = useStore((state) => state.logFilter);
  const setFilter = useStore((state) => state.setLogFilter);

  const buttonRef = useRef<HTMLButtonElement>(null);

  const filtered = useMemo(() => {
    const result = applyLogFilter(events, filter);
    /* Oldest first, newest last — chronological top-to-bottom matches how
       people read a transcript / changelog. */
    return [...result].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }, [events, filter]);

  const filterController = useMemo(
    () => new LogFilterController(filter, setFilter),
    [filter, setFilter],
  );
  const popoverOpen =
    activePopover.key === NO_LOOSE_STRING_VALUES.logFilter && activePopover.anchorRect !== null;

  function toggleFilter(): void {
    if (popoverOpen) {
      closePopover();
      return;
    }
    if (buttonRef.current === null) return;
    openPopover(NO_LOOSE_STRING_VALUES.logFilter, buttonRef.current.getBoundingClientRect());
  }

  return {
    actions: {
      applyFilter: setFilter,
      closePopover,
      jumpTo: jumpToLogEvent,
      toggleFilter,
    },
    buttonRef,
    events,
    filterController,
    filtered,
    participants,
    popoverAnchorRect: activePopover.anchorRect,
    popoverOpen,
  };
}
