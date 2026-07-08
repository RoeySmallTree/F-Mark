import { createContext, useContext } from "react";

/* Reveal the file viewer when a file is opened. The MAIN APP provides
   `surfaceFileDisplayInDock` (activate / re-home the `filesDisplay` dock pane);
   the standalone /file-tree page leaves the default no-op in place so its file
   clicks never mutate the global dock — it has its own always-mounted viewer.

   openFile() itself stays tab-state only; callers that should also reveal the
   viewer call this surfacer right after. */
export type SurfaceFileDisplay = () => void;

const FileDisplaySurfaceContext = createContext<SurfaceFileDisplay>(() => {});

export const FileDisplaySurfaceProvider = FileDisplaySurfaceContext.Provider;

export function useSurfaceFileDisplay(): SurfaceFileDisplay {
  return useContext(FileDisplaySurfaceContext);
}
