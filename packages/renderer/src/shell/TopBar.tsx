import { TopBarActions } from "./topBar/TopBarActions.js";
import { TopBarBrand } from "./topBar/TopBarBrand.js";
import { RuntimeProbeBanner } from "./topBar/RuntimeProbeBanner.js";
import { SessionBreadcrumb } from "./topBar/SessionBreadcrumb.js";
import type { KernelRestartState } from "./topBar/types.js";

const NO_LOOSE_STRING_VALUES = {
  idle: "idle",
} as const;

interface TopBarProps {
  devKernelRestartEnabled?: boolean;
  kernelRestartState?: KernelRestartState;
  onRestartKernel?: () => void;
}

export function TopBar({
  devKernelRestartEnabled = false,
  kernelRestartState = NO_LOOSE_STRING_VALUES.idle,
  onRestartKernel,
}: TopBarProps): JSX.Element {
  return (
    <div className="topbar-wrap">
      <RuntimeProbeBanner />
      <div className="topbar" role="banner">
        <TopBarBrand />
        <SessionBreadcrumb />

        {/* Identity and global actions only. Pane and view controls moved to
            LedgerHeader, beside the document they act on. */}
        <div className="topbar-center" />

        <TopBarActions
          devKernelRestartEnabled={devKernelRestartEnabled}
          kernelRestartState={kernelRestartState}
          onRestartKernel={onRestartKernel}
        />
      </div>
    </div>
  );
}
