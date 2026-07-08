import { RefreshCw, Search, Settings } from "lucide-react";
import { chordToLabel } from "../../modals/settings/shortcut-registry.js";
import { useStore } from "../../state/store.js";
import type { KernelRestartState } from "./types.js";

const NO_LOOSE_STRING_VALUES = {
  restarting: "restarting",
  cmdk: "cmdk",
  profile: "profile",
} as const;

const COMMAND_PALETTE_SHORTCUT = chordToLabel("$mod+K");
const KERNEL_RESTART_SHORTCUT = chordToLabel("Meta+Alt+Ctrl+R");

interface TopBarActionsProps {
  devKernelRestartEnabled: boolean;
  kernelRestartState: KernelRestartState;
  onRestartKernel?: () => void;
}

export function TopBarActions({
  devKernelRestartEnabled,
  kernelRestartState,
  onRestartKernel,
}: TopBarActionsProps): JSX.Element {
  const openModal = useStore((s) => s.openModal);
  const openSettings = useStore((s) => s.openSettings);

  return (
    <div className="topbar-right">
      {devKernelRestartEnabled ? (
        <button
          type="button"
          className={`icon-btn kernel-restart-btn is-${kernelRestartState}`}
          title={`Restart kernel (${KERNEL_RESTART_SHORTCUT})`}
          aria-label="Restart kernel"
          aria-busy={kernelRestartState === "restarting"}
          onClick={onRestartKernel}
          disabled={
            onRestartKernel === undefined || kernelRestartState === NO_LOOSE_STRING_VALUES.restarting
          }
        >
          <RefreshCw size={15} aria-hidden="true" />
        </button>
      ) : null}
      <button
        type="button"
        className="icon-btn"
        title={`Search (${COMMAND_PALETTE_SHORTCUT})`}
        aria-label="Open command palette"
        onClick={() => openModal(NO_LOOSE_STRING_VALUES.cmdk)}
      >
        <Search size={15} aria-hidden="true" />
      </button>
      <button
        type="button"
        className="icon-btn"
        title="Settings"
        aria-label="Open settings"
        onClick={() => openSettings(NO_LOOSE_STRING_VALUES.profile)}
      >
        <Settings size={15} aria-hidden="true" />
      </button>
    </div>
  );
}
