import { waitFor } from "@testing-library/react";
import type { AnyEventRecord } from "@f-mark/shared";
import { expect } from "vitest";
import { useStore } from "../../src/state/store.js";
import { REPO_B, SELECTED_EVENT } from "./fixtures.js";
import type { FetchMock } from "./mockServer.js";
import { socketCount } from "./mockWebSocket.js";

export async function waitForSessionState(
  sessionId: string,
  pathId: string,
  events: AnyEventRecord[],
): Promise<void> {
  await waitFor(() => {
    expect(useStore.getState().currentSessionId).toBe(sessionId);
    expect(useStore.getState().selectedPathId).toBe(pathId);
    expect(useStore.getState().events).toEqual(events);
  });
}

export async function waitForCurrentSession(
  sessionId: string,
  events: AnyEventRecord[],
): Promise<void> {
  await waitFor(() => {
    expect(useStore.getState().currentSessionId).toBe(sessionId);
    expect(useStore.getState().events).toEqual(events);
  });
}

export async function waitForSockets(): Promise<void> {
  await waitFor(() => {
    expect(socketCount()).toBeGreaterThan(0);
  });
}

export async function waitForSelectedPathId(pathId: string): Promise<void> {
  await waitFor(() => {
    expect(useStore.getState().selectedPathId).toBe(pathId);
  });
}

export async function waitForEnsureBodies(
  ensureBodies: unknown[],
  expected: unknown[],
): Promise<void> {
  await waitFor(() => {
    expect(ensureBodies).toEqual(expected);
  });
}

export async function waitForEnsureBodyCount(
  ensureBodies: unknown[],
  count: number,
): Promise<void> {
  await waitFor(() => {
    expect(ensureBodies).toHaveLength(count);
  });
}

export async function waitForRegistryPreserved(
  fetchMock: FetchMock,
): Promise<void> {
  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalledWith("/sessions?scope=all", expect.anything());
    expect(useStore.getState().currentSessionId).toBe("selected-session");
    expect(useStore.getState().selectedPathId).toBe(REPO_B.pathId);
  });
}

export async function waitForSelectedEventRefetch(
  selectedFetchCount: () => number,
  initialFetches: number,
): Promise<void> {
  await waitFor(() => {
    expect(selectedFetchCount()).toBeGreaterThan(initialFetches);
    expect(useStore.getState().events).toEqual([SELECTED_EVENT]);
  });
}

export function expectParticipantsFetched(fetchMock: FetchMock): void {
  expect(fetchMock).toHaveBeenCalledWith(
    `/participants?path_id=${REPO_B.pathId}`,
    expect.anything(),
  );
}

export function expectSecondEnsureBodyScoped(ensureBodies: unknown[]): void {
  expect(ensureBodies[1]).toEqual({ idle_only: true, path_id: REPO_B.pathId });
}

export function expectEnsureFetchCount(fetchMock: FetchMock, count: number): void {
  expect(callsEndingWith(fetchMock, "/sessions/focus-session/ensure-managed-agents"))
    .toHaveLength(count);
}

export function expectNoLegacyEventFetch(fetchMock: FetchMock): void {
  expect(fetchMock).not.toHaveBeenCalledWith(
    "/sessions/selected-session/events?path_id=legacy-id",
    expect.anything(),
  );
}

export function expectSelectedFetchesUnchanged(
  selectedFetches: number,
  initialFetches: number,
): void {
  expect(selectedFetches).toBe(initialFetches);
}

function callsEndingWith(fetchMock: FetchMock, suffix: string): unknown[][] {
  return fetchMock.mock.calls.filter(([url]) => String(url).endsWith(suffix));
}
