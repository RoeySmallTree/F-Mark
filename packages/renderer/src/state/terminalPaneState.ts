const NO_LOOSE_STRING_VALUES = {
  terminals: "terminals",
  agents: "agents",
  terminal: "terminal",
  right: "right",
} as const;

/* Terminal dock pane UI state: which source the pane shows (regular standalone
   "terminals" vs per-agent "agents" terminals) and, in agents mode, which
   agent's terminal is selected.

   This is a tiny standalone pub/sub (like the dock-layout module) rather than a
   store slice, so the agent "open terminal" affordances — which live in other
   panes/components — can flip the Terminal pane into Agents mode and focus a
   specific agent without threading props or coupling to the main store. */

import { useSyncExternalStore } from "react";
import {
  activateDockPaneIfPlaced,
  applyDockLayout,
  getCurrentDockLayout,
  moveDockPane,
} from "../shell/dockLayout.js";
import { useStore } from "./store.js";

export type TerminalPaneMode = "terminals" | "agents";

let mode: TerminalPaneMode = NO_LOOSE_STRING_VALUES.agents;
let activeAgentTmux: string | null = null;
const subscribers = new Set<() => void>();

function emit(): void {
  for (const cb of subscribers) {
    try {
      cb();
    } catch {
      /* no-op */
    }
  }
}

function subscribe(cb: () => void): () => void {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}

export function getTerminalPaneMode(): TerminalPaneMode {
  return mode;
}

export function getActiveAgentTmux(): string | null {
  return activeAgentTmux;
}

export function setTerminalPaneMode(next: TerminalPaneMode): void {
  if (next === mode) return;
  mode = next;
  emit();
}

export function setActiveAgentTerminal(tmux: string | null): void {
  if (tmux === activeAgentTmux) return;
  activeAgentTmux = tmux;
  emit();
}

/* Flip the Terminal dock pane to Agents mode focused on one agent's live
   terminal, and bring that pane to the front. Replaces the old modal overlay
   as the target of the agent "open terminal" affordances. */
export function openAgentTerminalPane(tmux: string): void {
  mode = NO_LOOSE_STRING_VALUES.agents;
  activeAgentTmux = tmux;
  emit();
  if (!activateDockPaneIfPlaced(NO_LOOSE_STRING_VALUES.terminal)) {
    // Not currently in a visible area (e.g. stowed in the toolbar) — re-home it.
    applyDockLayout(moveDockPane(getCurrentDockLayout(), NO_LOOSE_STRING_VALUES.terminal, NO_LOOSE_STRING_VALUES.right));
  }
  useStore.getState().setRightTab(NO_LOOSE_STRING_VALUES.terminal);
}

export function useTerminalPaneMode(): TerminalPaneMode {
  return useSyncExternalStore(subscribe, getTerminalPaneMode);
}

export function useActiveAgentTmux(): string | null {
  return useSyncExternalStore(subscribe, getActiveAgentTmux);
}
