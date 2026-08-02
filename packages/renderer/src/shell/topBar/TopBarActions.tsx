import { RefreshCw, Search, Settings } from "lucide-react";
import { chordToLabel } from "../../modals/settings/shortcut-registry.js";
import { useElapsed } from "../../hooks/useElapsed.js";
import { useStore } from "../../state/store.js";
import type { KernelRestartState } from "./types.js";

const NO_LOOSE_STRING_VALUES = {
  restarting: "restarting",
  cmdk: "cmdk",
  profile: "profile",
} as const;

const COMMAND_PALETTE_SHORTCUT = chordToLabel("$mod+K");
const KERNEL_RESTART_SHORTCUT = chordToLabel("Meta+Alt+Ctrl+R");

interface LastEventAgeProps {
  since: string;
}

/* The freshness indicator's whole job is to say how current this view is.
   Rendered once it becomes a lie within seconds, which is worse than showing
   nothing - a stale number reads as a fresh one. useElapsed re-renders only
   this span every second, not the rest of the top bar. No aria-live: a
   per-second DOM mutation inside a live region would be announced on every
   tick, so this span (and its ancestors) must stay outside any live region. */
function LastEventAge({ since }: LastEventAgeProps): JSX.Element {
  const age = useElapsed(since);
  return <span className="topbar-last-event">last event {age} ago</span>;
}

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
  const events = useStore((s) => s.events);
  const newestEvent = events.at(-1) ?? null;

  return (
    <div className="topbar-right">
      {newestEvent ? (
        <LastEventAge since={newestEvent.timestamp} />
      ) : (
        <span className="topbar-last-event">no events yet</span>
      )}
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
