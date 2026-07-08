import { createContext } from "react";

/* TopBarModalContext — surfaces the local modal-state setters TopBar
   needs to open the standalone modals (TerminalOverlay, ReconnectModal).
   These modals live as React state in
   <App/> rather than in the zustand store because their lifetime is tied
   to a specific tmux session / agent / runtime tuple and the existing
   activeModal slot only carries an enum key. */
export interface TopBarModalContextValue {
  openTerminalOverlay(tmuxSession: string): void;
  openReconnect(
    participantId: string,
    sessionId: string,
    runtimeId: string,
  ): void;
}

export const TopBarModalContext = createContext<TopBarModalContextValue | null>(
  null,
);
