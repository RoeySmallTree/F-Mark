import type { CSSProperties } from "react";
import { defaultPaneSizes, useStore } from "../state/store.js";
import { TopBar } from "../shell/TopBar.js";
import { LeftPanel } from "../shell/LeftPanel.js";
import { RightPanel } from "../shell/RightPanel.js";
import { DockAreaView } from "../shell/DockAreaView.js";
import { ModalRoot } from "../modals/ModalRoot.js";
import { ModalShell } from "../panels/fileViewer/shells/ModalShell.js";
import { useShellPlacement } from "../hooks/useShellPlacement.js";
import { useDockLayout } from "../hooks/useDockLayout.js";
import { heightVar, placementKey, widthVar } from "../themes/layout.js";
import type { KernelRestartState } from "./useKernelRestart.js";

const NO_LOOSE_STRING_VALUES = {
  leftpanel: "leftPanel",
  rightpanel: "rightPanel",
  center: "center",
  centerDockContent: "center-dock-content",
  bottom: "bottom",
} as const;

function useMainStyle(): Record<string, string> {
  /* Shell placement (Settings → Appearance → Pane arrangement). The active
     placement keys the generated grid rule on `.main`; the per-session pane
     sizes become CSS vars the generated tracks reference. */
  const currentSizes = useStore((s) =>
    s.currentSessionId !== null
      ? (s.panelSizeBySession[s.currentSessionId] ?? null)
      : null,
  );
  const sizes = currentSizes ?? defaultPaneSizes();
  return {
    [widthVar(NO_LOOSE_STRING_VALUES.leftpanel)]: `${sizes.leftPanel.width}px`,
    [heightVar(NO_LOOSE_STRING_VALUES.leftpanel)]: `${sizes.leftPanel.height}px`,
    [widthVar(NO_LOOSE_STRING_VALUES.rightpanel)]: `${sizes.rightPanel.width}px`,
    [heightVar(NO_LOOSE_STRING_VALUES.rightpanel)]: `${sizes.rightPanel.height}px`,
  };
}

export function AppShell(input: {
  devKernelRestartEnabled: boolean;
  kernelRestartState: KernelRestartState;
  onRestartKernel(): void;
}): JSX.Element {
  const placement = useShellPlacement();
  const mainStyle = useMainStyle();
  const fileViewerModalOpen = useStore((s) => s.fileViewerModalOpen);
  const dockLayout = useDockLayout();
  const hasBottomDock = dockLayout.areas.bottom.length > 0;

  return (
    <>
      <TopBar
        devKernelRestartEnabled={input.devKernelRestartEnabled}
        kernelRestartState={input.kernelRestartState}
        onRestartKernel={input.onRestartKernel}
      />
      <div
        className="main"
        data-shell-layout={placementKey(placement)}
        style={mainStyle as CSSProperties}
      >
        <LeftPanel />
        <div
          className="chat-region"
          data-has-bottom-dock={hasBottomDock ? "true" : undefined}
        >
          <DockAreaView
            area={NO_LOOSE_STRING_VALUES.center}
            label="Center pane tabs"
            tabsClassName="dock-tabs center-dock-tabs"
            contentClassName={NO_LOOSE_STRING_VALUES.centerDockContent}
            empty={<div className="dock-empty">Drop a pane here</div>}
          />
          <div
            className="bottom-dock-region"
            data-empty={hasBottomDock ? undefined : "true"}
          >
            <DockAreaView
              area={NO_LOOSE_STRING_VALUES.bottom}
              label="Bottom pane tabs"
              tabsClassName="dock-tabs bottom-dock-tabs"
              contentClassName="bottom-dock-content"
              empty={<div className="dock-empty dock-empty-compact" />}
              alwaysShowTabs
            />
          </div>
        </div>
        <RightPanel />
      </div>
      {fileViewerModalOpen ? <ModalShell /> : null}
      <ModalRoot />
    </>
  );
}
