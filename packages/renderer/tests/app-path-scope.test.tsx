import { afterEach, beforeEach, describe, test } from "vitest";
import { REPO_B, SELECTED_EVENT } from "./app-path-scope/fixtures.js";
import {
  expectEnsureFetchCount,
  expectNoLegacyEventFetch,
  expectParticipantsFetched,
  expectSecondEnsureBodyScoped,
  expectSelectedFetchesUnchanged,
  waitForCurrentSession,
  waitForEnsureBodies,
  waitForEnsureBodyCount,
  waitForRegistryPreserved,
  waitForSelectedEventRefetch,
  waitForSelectedPathId,
  waitForSessionState,
  waitForSockets,
} from "./app-path-scope/assertions.js";
import {
  dispatchWindowFocusTwice,
  emitLegacyEventAdded,
  emitPathsUpdatedForRepoA,
  emitSelectedEventAdded,
} from "./app-path-scope/interactions.js";
import {
  installBootRestoreServer,
  installEventFilterServer,
  installFocusEnsureServer,
  installRegistryUpdateServer,
} from "./app-path-scope/scenarios.js";
import {
  renderApp,
  saveLastFocusedSession,
  seedSelectedSession,
  setupAppPathScopeTest,
  teardownAppPathScopeTest,
} from "./app-path-scope/setup.js";

describe("App selected-root path scoping", () => {
  beforeEach(setupAppPathScopeTest);
  afterEach(teardownAppPathScopeTest);

  test("boot restores the last focused session by path_id from all sessions", async () => {
    saveLastFocusedSession(REPO_B.pathId, "saved-session");
    const fetchMock = installBootRestoreServer();

    renderApp();

    await waitForSessionState("saved-session", REPO_B.pathId, [SELECTED_EVENT]);
    expectParticipantsFetched(fetchMock);
  });

  test("debounces focus ensure with the selected root scope", async () => {
    const ensureBodies: unknown[] = [];
    const fetchMock = installFocusEnsureServer(ensureBodies);

    renderApp();

    await waitForCurrentSession("focus-session", [SELECTED_EVENT]);
    await waitForEnsureBodies(ensureBodies, [
      { idle_only: true, path_id: REPO_B.pathId },
    ]);

    await dispatchWindowFocusTwice();

    await waitForEnsureBodyCount(ensureBodies, 2);
    expectSecondEnsureBodyScoped(ensureBodies);
    expectEnsureFetchCount(fetchMock, 2);
  });

  test("registry websocket updates do not rewrite the selected session", async () => {
    const fetchMock = installRegistryUpdateServer();

    seedSelectedSession();
    renderApp();

    await waitForCurrentSession("selected-session", [SELECTED_EVENT]);
    await waitForSockets();

    await emitPathsUpdatedForRepoA();

    await waitForRegistryPreserved(fetchMock);
  });

  test("websocket event filtering uses selected session path_id", async () => {
    let selectedFetches = 0;
    const fetchMock = installEventFilterServer(() => {
      selectedFetches += 1;
    });

    renderApp();

    await waitForSelectedPathId(REPO_B.pathId);
    await waitForSockets();
    const initialFetches = selectedFetches;

    await emitLegacyEventAdded();

    expectSelectedFetchesUnchanged(selectedFetches, initialFetches);

    await emitSelectedEventAdded();

    await waitForSelectedEventRefetch(() => selectedFetches, initialFetches);
    expectNoLegacyEventFetch(fetchMock);
  });
});
