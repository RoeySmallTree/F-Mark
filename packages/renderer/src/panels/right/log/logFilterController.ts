import {
  DEFAULT_FILTER,
  activeFilterCount,
  hasActiveFilter,
  type LogFilter,
} from "../../../popovers/log-filter-types.js";

const NO_LOOSE_STRING_VALUES = {
  all: "all",
  today: "today",
} as const;

export class LogFilterController {
  constructor(
    readonly filter: LogFilter,
    private readonly setFilter: (filter: LogFilter) => void,
  ) {}

  get activeCount(): number {
    return activeFilterCount(this.filter);
  }

  get hasAny(): boolean {
    return hasActiveFilter(this.filter);
  }

  clearAll = (): void => {
    this.setFilter(DEFAULT_FILTER);
  };

  clearNamedOnly = (): void => {
    this.setFilter({ ...this.filter, namedOnly: false });
  };

  clearRange = (): void => {
    this.setFilter({
      ...this.filter,
      range: NO_LOOSE_STRING_VALUES.all,
      customStart: undefined,
      customEnd: undefined,
    });
  };

  removeKind = (kind: string): void => {
    this.setFilter({
      ...this.filter,
      kinds: this.filter.kinds.filter((value) => value !== kind),
    });
  };

  removeParticipant = (id: string): void => {
    this.setFilter({
      ...this.filter,
      participants: this.filter.participants.filter((value) => value !== id),
    });
  };
}

export function chipLabelForRange(filter: LogFilter): string {
  switch (filter.range) {
    case "today":
      return NO_LOOSE_STRING_VALUES.today;
    case "7d":
      return "last 7d";
    case "30d":
      return "last 30d";
    case "custom":
      return "custom range";
    case "all":
    default:
      return "";
  }
}
