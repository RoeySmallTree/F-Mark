import { DEFAULT_FILTER } from "../../popovers/log-filter-types.js";
import {
  clampPaneSize,
  defaultPaneSizes,
  loadPanelSizeBySession,
  loadRightScrollBySession,
  loadRightTabBySession,
  savePanelSizeBySession,
  saveRightScrollBySession,
  saveRightTabBySession,
} from "../panePersistence.js";
import {
  loadRightTabsConfig,
  loadRightTabsConfigBySession,
  saveRightTabsConfig,
  saveRightTabsConfigBySession,
} from "../rightTabsConfig.js";
import type { State } from "../storeTypes.js";
import type { StoreGet, StoreSet } from "./sliceTypes.js";

const NO_LOOSE_STRING_VALUES = {
  sessions: "sessions",
  log: "log",
  profile: "profile",
  layout: "layout",
} as const;

type UiSlice = Pick<
  State,
  | "leftRail"
  | "rightTab"
  | "rightTabsConfig"
  | "rightTabsConfigBySession"
  | "followMode"
  | "scrollToBottomTick"
  | "panelSizeBySession"
  | "rightTabBySession"
  | "rightScrollBySession"
  | "activeModal"
  | "settingsSection"
  | "editingPreset"
  | "editingSkill"
  | "htmlPreview"
  | "customPresetsVersion"
  | "customCategoriesVersion"
  | "activePopover"
  | "logFilter"
  | "setLeftRail"
  | "setRightTab"
  | "setRightTabsConfig"
  | "setRightTabsConfigForSession"
  | "clearRightTabsConfigForSessionOverride"
  | "setPaneSize"
  | "setRightScroll"
  | "setFollowMode"
  | "requestScrollToBottom"
  | "openModal"
  | "openSettings"
  | "setSettingsSection"
  | "closeModal"
  | "openPresetEditor"
  | "openSkillEditor"
  | "openHtmlPreview"
  | "bumpCustomPresets"
  | "bumpCustomCategories"
  | "openPopover"
  | "closePopover"
  | "setLogFilter"
>;

export function createUiSlice(set: StoreSet, get: StoreGet): UiSlice {
  return {
    leftRail: NO_LOOSE_STRING_VALUES.sessions,
    rightTab: NO_LOOSE_STRING_VALUES.log,
    rightTabsConfig: loadRightTabsConfig(),
    rightTabsConfigBySession: loadRightTabsConfigBySession(),
    followMode: true,
    scrollToBottomTick: 0,
    panelSizeBySession: loadPanelSizeBySession(),
    rightTabBySession: loadRightTabBySession(),
    rightScrollBySession: loadRightScrollBySession(),
    activeModal: null,
    settingsSection: NO_LOOSE_STRING_VALUES.profile,
    editingPreset: null,
    editingSkill: null,
    htmlPreview: null,
    customPresetsVersion: 0,
    customCategoriesVersion: 0,
    activePopover: { key: null, anchorRect: null },
    logFilter: DEFAULT_FILTER,
    setLeftRail: (leftRail) => set({ leftRail }),
    setRightTab: (rightTab) => {
      const state = get();
      if (rightTab === NO_LOOSE_STRING_VALUES.layout || state.currentSessionId === null) {
        set({ rightTab });
        return;
      }
      const next = {
        ...state.rightTabBySession,
        [state.currentSessionId]: rightTab,
      };
      saveRightTabBySession(next);
      set({ rightTab, rightTabBySession: next });
    },
    setRightTabsConfig: (cfg) => {
      saveRightTabsConfig(cfg);
      set({ rightTabsConfig: cfg });
    },
    setRightTabsConfigForSession: (cfg) => {
      const state = get();
      const sid = state.currentSessionId;
      if (sid === null) return;
      const next = { ...state.rightTabsConfigBySession, [sid]: cfg };
      saveRightTabsConfigBySession(next);
      set({ rightTabsConfigBySession: next });
    },
    clearRightTabsConfigForSessionOverride: () => {
      const state = get();
      const sid = state.currentSessionId;
      if (sid === null) return;
      if (state.rightTabsConfigBySession[sid] === undefined) return;
      const next = { ...state.rightTabsConfigBySession };
      delete next[sid];
      saveRightTabsConfigBySession(next);
      set({ rightTabsConfigBySession: next });
    },
    setPaneSize: (pane, axis, px) => {
      const state = get();
      if (state.currentSessionId === null) return;
      const sid = state.currentSessionId;
      const clamped = clampPaneSize(axis, px);
      const cur = state.panelSizeBySession[sid] ?? defaultPaneSizes();
      const next = {
        ...state.panelSizeBySession,
        [sid]: { ...cur, [pane]: { ...cur[pane], [axis]: clamped } },
      };
      savePanelSizeBySession(next);
      set({ panelSizeBySession: next });
    },
    setRightScroll: (scrollTop) => {
      const state = get();
      if (state.currentSessionId === null) return;
      const next = {
        ...state.rightScrollBySession,
        [state.currentSessionId]: Math.max(0, Math.round(scrollTop)),
      };
      saveRightScrollBySession(next);
      set({ rightScrollBySession: next });
    },
    setFollowMode: (followMode) => set({ followMode }),
    requestScrollToBottom: () =>
      set((s) => ({ scrollToBottomTick: s.scrollToBottomTick + 1 })),
    openModal: (activeModal) =>
      set(
        activeModal === "settings"
          ? { activeModal, settingsSection: "profile" }
          : { activeModal },
      ),
    openSettings: (settingsSection = NO_LOOSE_STRING_VALUES.profile) =>
      set({ activeModal: "settings", settingsSection }),
    setSettingsSection: (settingsSection) => set({ settingsSection }),
    closeModal: () =>
      set({
        activeModal: null,
        editingPreset: null,
        editingSkill: null,
        htmlPreview: null,
      }),
    openPresetEditor: (editingPreset) =>
      set({ activeModal: "preset-editor", editingPreset }),
    openSkillEditor: (editingSkill) =>
      set({ activeModal: "skill-editor", editingSkill }),
    openHtmlPreview: (htmlPreview) =>
      set({ activeModal: "html-preview", htmlPreview }),
    bumpCustomPresets: () =>
      set((s) => ({ customPresetsVersion: s.customPresetsVersion + 1 })),
    bumpCustomCategories: () =>
      set((s) => ({ customCategoriesVersion: s.customCategoriesVersion + 1 })),
    openPopover: (key, anchorRect) =>
      set({ activePopover: { key, anchorRect } }),
    closePopover: () => set({ activePopover: { key: null, anchorRect: null } }),
    setLogFilter: (logFilter) => set({ logFilter }),
  };
}
