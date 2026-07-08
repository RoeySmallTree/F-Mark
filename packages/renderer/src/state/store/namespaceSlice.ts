import {
  loadFileViewerActiveBySession,
  loadFileViewerTabsBySession,
} from "../fileViewerPersistence.js";
import {
  loadPanelSizeBySession,
  loadRightScrollBySession,
  loadRightTabBySession,
} from "../panePersistence.js";
import {
  loadRightTabsConfig,
  loadRightTabsConfigBySession,
} from "../rightTabsConfig.js";
import {
  loadLastSeenBySession,
  loadViewModeBySession,
} from "../sessionPersistence.js";
import type { State } from "../storeTypes.js";
import type { StoreSet } from "./sliceTypes.js";

type NamespaceSlice = Pick<State, "rehydrateNamespacedSlices">;

export function createNamespaceSlice(set: StoreSet): NamespaceSlice {
  return {
    rehydrateNamespacedSlices: () => {
      set({
        rightTabsConfig: loadRightTabsConfig(),
        rightTabsConfigBySession: loadRightTabsConfigBySession(),
        viewModeBySession: loadViewModeBySession(),
        lastSeenBySession: loadLastSeenBySession(),
        panelSizeBySession: loadPanelSizeBySession(),
        rightTabBySession: loadRightTabBySession(),
        rightScrollBySession: loadRightScrollBySession(),
        fileViewerTabsBySession: loadFileViewerTabsBySession(),
        fileViewerActiveBySession: loadFileViewerActiveBySession(),
        fileViewerModalOpen: false,
      });
    },
  };
}
