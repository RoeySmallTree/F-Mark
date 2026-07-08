/* CmdKModal — universal command palette.
   Triggered by `$mod+K` (registered globally in App.tsx). Surfaces:
     - Recent sessions (empty query) + first 4 Quick actions.
     - As the user types, filters across sessions, named contributions in the
       current session, backend search hits, and quick actions.
   Keyboard:
     - Arrow up/down navigates with wrap-around.
     - Enter activates the selected row.
     - Escape closes (handled by ModalRoot's window listener).

   Search is debounced 200ms so typing fast doesn't spam the backend. */

import { useCallback, useMemo, useState, type JSX } from "react";
import { activateCmdKRow } from "./cmdk/actionController.js";
import { CmdKPaletteView } from "./cmdk/CmdKPaletteView.js";
import { buildCmdKPaletteModel } from "./cmdk/model.js";
import { useCmdKModalBindings } from "./cmdk/useModalBindings.js";
import { useCmdKPaletteData } from "./cmdk/usePaletteData.js";
import type { CmdkRow } from "./cmdk/sources.js";

export function CmdKModal(): JSX.Element {
  const {
    activePath,
    closeModal,
    currentSessionId,
    events,
    openModal,
    sessions,
    setCurrentSession,
    setParticipants,
    setPathsState,
    setSessions,
    token,
  } = useCmdKModalBindings();

  const [query, setQuery] = useState("");
  const { allEventGroups, allSessions, searchHits } = useCmdKPaletteData({
    query,
    sessions,
    token,
  });

  const model = useMemo(
    () =>
      buildCmdKPaletteModel({
        allEventGroups,
        allSessions,
        currentSessionId,
        events,
        query,
        searchHits,
        sessions,
      }),
    [
      allEventGroups,
      allSessions,
      currentSessionId,
      events,
      query,
      searchHits,
      sessions,
    ],
  );

  const activate = useCallback(
    (row: CmdkRow): void =>
      activateCmdKRow(row, {
        activePath,
        closeModal,
        openModal,
        setCurrentSession,
        setParticipants,
        setPathsState,
        setSessions,
        token,
      }),
    [
      activePath,
      closeModal,
      openModal,
      setCurrentSession,
      setParticipants,
      setPathsState,
      setSessions,
      token,
    ],
  );

  return (
    <CmdKPaletteView
      flatRows={model.flatRows}
      groups={model.groups}
      onActivate={activate}
      onQueryChange={setQuery}
      query={query}
    />
  );
}
