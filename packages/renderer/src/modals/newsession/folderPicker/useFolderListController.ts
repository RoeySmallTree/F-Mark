import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  childPath,
  firstEntryIndex,
  listStateFromError,
  listStateFromResponse,
  LOADING_LIST_STATE,
  splitBreadcrumbs,
} from "./model.js";
import type {
  FolderListController,
  FolderPickerClient,
} from "./types.js";

const NO_LOOSE_STRING_VALUES = {
  loading: "loading",
} as const;

interface FolderListControllerInput {
  client: FolderPickerClient;
  initialPath: string | null;
  onPathChange?(path: string): void;
}

export function useFolderListController(
  input: FolderListControllerInput,
): FolderListController {
  const { client, initialPath, onPathChange } = input;
  const [state, setState] = useState(LOADING_LIST_STATE);
  const [focusedIdx, setFocusedIdx] = useState(-1);
  const onPathChangeRef = useRef(onPathChange);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    onPathChangeRef.current = onPathChange;
  }, [onPathChange]);

  const load = useCallback(
    async (target: string): Promise<void> => {
      setState((previous) => ({
        ...previous,
        status: NO_LOOSE_STRING_VALUES.loading,
        error: null,
      }));
      try {
        const data = await client.fsList(target);
        setState(listStateFromResponse(data));
        setFocusedIdx(firstEntryIndex(data.entries));
        onPathChangeRef.current?.(data.path);
      } catch (error) {
        setState(listStateFromError(target, error));
      }
    },
    [client],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let start = initialPath;
      if (start === null || start.length === 0) {
        start = await loadHomePath(client).catch(() => "/");
      }
      if (!cancelled) await load(start);
    })();
    return () => {
      cancelled = true;
    };
  }, [initialPath, client, load]);

  useEffect(() => {
    const focusedRow = listRef.current?.querySelector<HTMLElement>(
      `[data-row-idx='${focusedIdx}']`,
    );
    if (focusedRow && typeof focusedRow.scrollIntoView === "function") {
      focusedRow.scrollIntoView({ block: "nearest" });
    }
  }, [focusedIdx]);

  const focusEntry = useCallback((index: number): void => {
    setFocusedIdx(index);
  }, []);

  const openEntry = useCallback(
    (index: number, name: string): void => {
      setFocusedIdx(index);
      void load(childPath(state.path, name));
    },
    [load, state.path],
  );

  return {
    crumbs: splitBreadcrumbs(state.path),
    focusEntry,
    focusedIdx,
    listRef,
    load,
    openEntry,
    state,
  };
}

async function loadHomePath(client: FolderPickerClient): Promise<string> {
  const home = await client.fsHome();
  return home.home;
}
