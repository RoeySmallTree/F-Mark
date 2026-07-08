import {
  eventsPayload,
  legacyPathsPayload,
  multiRepoPathsPayload,
  REPO_A,
  REPO_B,
  repoBOnlyPathsPayload,
  SELECTED_EVENT,
  sessionFixture,
} from "./fixtures.js";
import {
  createScopedAppServer,
  jsonResponse,
  parseRequestBody,
  type FetchMock,
} from "./mockServer.js";

export function installBootRestoreServer(): FetchMock {
  const server = createScopedAppServer({
    paths: multiRepoPathsPayload(REPO_A, 7),
    sessions: [
      sessionFixture("newest-session", REPO_A, "2026-06-15T10:00:00.000Z"),
      sessionFixture("saved-session", REPO_B, "2026-06-14T10:00:00.000Z"),
    ],
  });
  return server
    .getJson(
      `/sessions/saved-session/events?path_id=${REPO_B.pathId}`,
      eventsPayload(SELECTED_EVENT),
    )
    .install();
}

export function installFocusEnsureServer(ensureBodies: unknown[]): FetchMock {
  const server = createScopedAppServer({
    paths: repoBOnlyPathsPayload(),
    sessions: [
      sessionFixture("focus-session", REPO_B, "2026-06-15T10:00:00.000Z"),
    ],
  });
  return server
    .getJson(
      `/sessions/focus-session/events?path_id=${REPO_B.pathId}`,
      eventsPayload(SELECTED_EVENT),
    )
    .on("/sessions/focus-session/ensure-managed-agents", (init) =>
      ensureManagedAgentsResponse(ensureBodies, init),
    )
    .install();
}

export function installRegistryUpdateServer(): FetchMock {
  const server = createScopedAppServer({
    paths: multiRepoPathsPayload(REPO_A, 1),
    sessions: [
      sessionFixture("selected-session", REPO_B, "2026-06-15T10:00:00.000Z"),
      sessionFixture("other-session", REPO_A, "2026-06-16T10:00:00.000Z"),
    ],
  });
  return server
    .getJson(
      `/sessions/selected-session/events?path_id=${REPO_B.pathId}`,
      eventsPayload(SELECTED_EVENT),
    )
    .install();
}

export function installEventFilterServer(onSelectedFetch: () => void): FetchMock {
  const server = createScopedAppServer({
    paths: legacyPathsPayload(),
    sessions: [
      sessionFixture("selected-session", REPO_B, "2026-06-15T10:00:00.000Z"),
    ],
  });
  return server
    .on(`/sessions/selected-session/events?path_id=${REPO_B.pathId}`, () => {
      onSelectedFetch();
      return jsonResponse(eventsPayload(SELECTED_EVENT));
    })
    .onMatching(
      (url) =>
        url.startsWith(
          `/sessions/selected-session/events?path_id=${REPO_B.pathId}&since=`,
        ),
      () => {
        onSelectedFetch();
        return jsonResponse(eventsPayload(SELECTED_EVENT));
      },
    )
    .getJson("/sessions/selected-session/events?path_id=legacy-id", {
      events: [],
    })
    .install();
}

function ensureManagedAgentsResponse(
  ensureBodies: unknown[],
  init?: RequestInit,
): Response {
  ensureBodies.push(parseRequestBody(init));
  return jsonResponse({
    session_id: "focus-session",
    resumed: [],
    already_live: [],
    skipped: [],
  });
}
