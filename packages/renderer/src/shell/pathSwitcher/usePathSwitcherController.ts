import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createClient } from "../../api/client.js";
import { useStore } from "../../state/store.js";
import { createPathSwitcherModel } from "./pathModel.js";
import { switchPathSelection } from "./pathSwitchController.js";
import type { PathSwitcherController } from "./types.js";

const NO_LOOSE_STRING_VALUES = {
  esc: "Esc",
} as const;

export function usePathSwitcherController(): PathSwitcherController {
  const token = useStore((state) => state.token);
  const activePath = useStore((state) => state.selectedPath);
  const knownPaths = useStore((state) => state.knownPaths) ?? [];
  const favorites = useStore((state) => state.favorites) ?? [];
  const setPathsState = useStore((state) => state.setPathsState);
  const setSessions = useStore((state) => state.setSessions);
  const setParticipants = useStore((state) => state.setParticipants);
  const setSelectedRoot = useStore((state) => state.setSelectedRoot);
  const setCurrentSession = useStore((state) => state.setCurrentSession);

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const client = useMemo(() => createClient({ baseUrl: "", token }), [token]);
  const model = useMemo(
    () => createPathSwitcherModel(knownPaths, favorites),
    [knownPaths, favorites],
  );

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent): void {
      if (rootRef.current?.contains(event.target as Node) !== true) {
        setOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape" || event.key === NO_LOOSE_STRING_VALUES.esc) {
        setOpen(false);
      }
    }

    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const switchTo = useCallback(
    (target: string): void => {
      if (busy) return;
      setBusy(true);
      setError(null);
      void switchPathSelection(target, {
        client,
        setCurrentSession,
        setParticipants,
        setPathsState,
        setSelectedRoot,
        setSessions,
      })
        .then(() => setOpen(false))
        .catch((caught: unknown) => {
          setError(caught instanceof Error ? caught.message : String(caught));
        })
        .finally(() => setBusy(false));
    },
    [
      busy,
      client,
      setCurrentSession,
      setParticipants,
      setPathsState,
      setSelectedRoot,
      setSessions,
    ],
  );

  return {
    activePath,
    busy,
    error,
    favorites: model.favorites,
    open,
    recents: model.recents,
    rootRef,
    switchTo,
    toggleOpen: () => setOpen((value) => !value),
  };
}
