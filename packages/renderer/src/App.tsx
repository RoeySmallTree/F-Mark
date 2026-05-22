import { useEffect } from "react";
import { createClient } from "./api/client.js";
import { connectWs } from "./api/ws.js";
import { useStore } from "./state/store.js";
import { TopBar } from "./shell/TopBar.js";
import { LeftRail } from "./shell/LeftRail.js";
import { LeftPanel } from "./shell/LeftPanel.js";
import { Feed } from "./shell/Feed.js";
import { RightPanel } from "./shell/RightPanel.js";
import { Compose } from "./shell/Compose.js";
import { ModalRoot } from "./modals/ModalRoot.js";

function readTokenFromQuery(): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  return params.get("token");
}

export function App(): JSX.Element {
  const token = useStore((s) => s.token);
  const setToken = useStore((s) => s.setToken);
  const setSessions = useStore((s) => s.setSessions);
  const setParticipants = useStore((s) => s.setParticipants);
  const setEvents = useStore((s) => s.setEvents);
  const upsertEvent = useStore((s) => s.upsertEvent);
  const setCurrentSession = useStore((s) => s.setCurrentSession);
  const currentSessionId = useStore((s) => s.currentSessionId);

  useEffect(() => {
    setToken(readTokenFromQuery());
  }, [setToken]);

  useEffect(() => {
    const client = createClient({ baseUrl: "", token });
    void (async () => {
      const [list, participants] = await Promise.all([
        client.listSessions(),
        client.listParticipants(),
      ]);
      setSessions(list);
      setParticipants(participants);
      const state = useStore.getState();
      if (list.length > 0 && state.currentSessionId === null) {
        setCurrentSession(list[0]!.id);
      }
    })();
  }, [token, setSessions, setParticipants, setCurrentSession]);

  useEffect(() => {
    if (currentSessionId === null) return;
    const client = createClient({ baseUrl: "", token });
    void (async () => {
      const events = await client.listEvents(currentSessionId, {});
      setEvents(events);
    })();
  }, [currentSessionId, token, setEvents]);

  useEffect(() => {
    if (currentSessionId === null) return;
    const ws = connectWs({ baseUrl: "", token }, async (m) => {
      if (m.session_id !== currentSessionId) return;
      if (m.type === "event_added") {
        const client = createClient({ baseUrl: "", token });
        const fresh = await client.listEvents(currentSessionId, {});
        for (const e of fresh) upsertEvent(e);
      }
    });
    return () => ws.close();
  }, [currentSessionId, token, upsertEvent]);

  return (
    <div className="app">
      <TopBar />
      <div className="main">
        <LeftRail />
        <LeftPanel />
        <Feed />
        <RightPanel />
      </div>
      <div className="compose">
        <Compose />
      </div>
      <ModalRoot />
    </div>
  );
}
