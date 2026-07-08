/* toolboxAccordion — shared toolbox disclosure controller.

   Each <ArbitraryGroupCard> (a "toolbox") used to own its open/closed state
   locally. That left every toolbox the reader had ever expanded sitting open,
   so an active session slowly filled with stacked, fully-expanded tool runs.

   This context lifts open-state to the feed. Live toolboxes share a single
   auto-open slot, so "new toolbox appears → previous auto-closes" still holds.
   A reader-opened toolbox is tracked separately and survives later live
   auto-opens.

   Cards rendered WITHOUT a provider (unit tests, isolated embeds) fall back to
   independent local state via `useToolboxAccordion` returning null, so the
   single-card default behaviour is preserved. */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type JSX,
  type ReactNode,
} from "react";

export interface ToolboxAccordionValue {
  /** True when `id` is expanded by either the live slot or the reader slot. */
  isOpen: (id: string) => boolean;
  /** Expand `id` as the current live toolbox, replacing the previous live slot. */
  openAuto: (id: string) => void;
  /** Expand `id` because the reader opened it manually. */
  openManual: (id: string) => void;
  /** Collapse `id` wherever it currently holds an open slot. */
  close: (id: string) => void;
}

const ToolboxAccordionContext = createContext<ToolboxAccordionValue | null>(
  null,
);

export function ToolboxAccordionProvider({
  children,
}: {
  children: ReactNode;
}): JSX.Element {
  const [autoOpenId, setAutoOpenId] = useState<string | null>(null);
  const [manualOpenId, setManualOpenId] = useState<string | null>(null);
  const isOpen = useCallback(
    (id: string) => autoOpenId === id || manualOpenId === id,
    [autoOpenId, manualOpenId],
  );
  const openAuto = useCallback((id: string) => setAutoOpenId(id), []);
  const openManual = useCallback((id: string) => {
    setManualOpenId(id);
    setAutoOpenId((current) => (current === id ? null : current));
  }, []);
  const close = useCallback(
    (id: string) => {
      setAutoOpenId((current) => (current === id ? null : current));
      setManualOpenId((current) => (current === id ? null : current));
    },
    [],
  );
  const value = useMemo<ToolboxAccordionValue>(
    () => ({ isOpen, openAuto, openManual, close }),
    [isOpen, openAuto, openManual, close],
  );
  return (
    <ToolboxAccordionContext.Provider value={value}>
      {children}
    </ToolboxAccordionContext.Provider>
  );
}

/** Read the surrounding accordion, or null when used standalone. */
export function useToolboxAccordion(): ToolboxAccordionValue | null {
  return useContext(ToolboxAccordionContext);
}
