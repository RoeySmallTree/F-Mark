import { useCallback } from "react";
import { useStore } from "../state/store.js";
import { useSurfaceFileDisplay } from "./fileDisplaySurface.js";

const NO_LOOSE_STRING_VALUES = {
  files: "files",
} as const;

function toOpenablePath(path: string, root: string | null): string {
  if (path.startsWith("/")) return path;
  if (root === null || root.length === 0) return path;
  return `${root.replace(/\/+$/, "")}/${path.replace(/^\.\//, "").replace(/^\/+/, "")}`;
}

export function usePresentFile(): (path: string) => void {
  const selectedPath = useStore((s) => s.selectedPath);
  const activePath = useStore((s) => s.activePath);
  const openFile = useStore((s) => s.openFile);
  const setRightTab = useStore((s) => s.setRightTab);
  const surfaceFileDisplay = useSurfaceFileDisplay();

  return useCallback(
    (path: string): void => {
      const absPath = toOpenablePath(path, selectedPath ?? activePath);
      setRightTab(NO_LOOSE_STRING_VALUES.files);
      openFile(absPath);
      surfaceFileDisplay();
    },
    [activePath, openFile, selectedPath, setRightTab, surfaceFileDisplay],
  );
}

