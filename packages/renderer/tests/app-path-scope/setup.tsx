import { cleanup, render, type RenderResult } from "@testing-library/react";
import { vi } from "vitest";
import { App } from "../../src/App.js";
import {
  LAST_FOCUSED_SESSION_STORAGE_KEY,
  useStore,
} from "../../src/state/store.js";
import { installMockWebSocket } from "./mockWebSocket.js";

function resetStore(): void {
  useStore.setState({
    token: null,
    sessions: [],
    currentSessionId: null,
    selectedPath: null,
    selectedPathId: null,
    participants: {},
    currentUserId: null,
    events: [],
    eventsBaseKey: null,
    activePath: null,
    activePathId: null,
    activeRevision: 0,
    knownPaths: [],
    favorites: [],
    activeModal: null,
    activePopover: { key: null, anchorRect: null },
  });
}

export function setupAppPathScopeTest(): void {
  resetStore();
  globalThis.localStorage?.clear();
  installMockWebSocket();
}

export function teardownAppPathScopeTest(): void {
  vi.unstubAllGlobals();
  globalThis.localStorage?.clear();
  cleanup();
}

export function renderApp(): RenderResult {
  return render(<App />);
}

export function saveLastFocusedSession(pathId: string, sessionId: string): void {
  globalThis.localStorage?.setItem(
    LAST_FOCUSED_SESSION_STORAGE_KEY,
    JSON.stringify({ [`id:${pathId}`]: sessionId }),
  );
}

export function seedSelectedSession(): void {
  useStore.setState({
    currentSessionId: "selected-session",
    selectedPath: "/repo-b",
    selectedPathId: "repo-b-id",
  });
}
