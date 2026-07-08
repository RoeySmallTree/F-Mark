import type { State } from "../storeTypes.js";
import { mergeEvents as mergeEventRecords } from "../mergeEvents.js";
import { setCachedEvents } from "../sessionEventsCache.js";
import type { StoreSet } from "./sliceTypes.js";

type EventsSlice = Pick<
  State,
  | "events"
  | "eventsBaseKey"
  | "eventsLoadingSessionId"
  | "setEvents"
  | "setEventsLoading"
  | "mergeEvents"
  | "upsertEvent"
>;

export function createEventsSlice(set: StoreSet): EventsSlice {
  return {
    events: [],
    eventsBaseKey: null,
    eventsLoadingSessionId: null,
    setEvents: (events, baseKey = null) => {
      if (baseKey !== null) setCachedEvents(baseKey, events);
      set({ events, eventsBaseKey: baseKey, eventsLoadingSessionId: null });
    },
    setEventsLoading: (sessionId, loading) =>
      set((s) => {
        if (loading) return { eventsLoadingSessionId: sessionId };
        if (s.eventsLoadingSessionId !== sessionId) return s;
        return { eventsLoadingSessionId: null };
      }),
    mergeEvents: (delta, baseKey) =>
      set((s) => {
        if (s.eventsBaseKey !== baseKey) return s;
        const events = mergeEventRecords(s.events, delta);
        setCachedEvents(baseKey, events);
        return { events, eventsLoadingSessionId: null };
      }),
    upsertEvent: (event) =>
      set((s) => {
        if (s.events.find((e) => e.filename === event.filename)) return s;
        const next = [...s.events, event].sort((a, b) =>
          a.timestamp.localeCompare(b.timestamp),
        );
        if (s.eventsBaseKey !== null) setCachedEvents(s.eventsBaseKey, next);
        return { events: next, eventsLoadingSessionId: null };
      }),
  };
}
