import { useCallback, useState } from "react";
import {
  DEFAULT_STATUS_FILTERS,
  type StatusFilterState,
  type VisibleTodoStatus,
} from "./types.js";

interface StatusFilterController {
  statusFilters: StatusFilterState;
  toggleStatusFilter: (status: VisibleTodoStatus) => void;
}

export function useStatusFilters(): StatusFilterController {
  const [statusFilters, setStatusFilters] = useState<StatusFilterState>(() => ({
    ...DEFAULT_STATUS_FILTERS,
  }));

  const toggleStatusFilter = useCallback((status: VisibleTodoStatus): void => {
    setStatusFilters((current) => ({
      ...current,
      [status]: !current[status],
    }));
  }, []);

  return { statusFilters, toggleStatusFilter };
}
