import { screen, waitFor } from "@testing-library/react";
import { expect, vi } from "vitest";
import { useStore } from "../../../src/state/store.js";
import { jsonResponse } from "../../cards/_helpers.js";
import { installTodoFetch } from "./fetch.js";
import { todoListResponse, todoTreeRef } from "./fixtures.js";
import { renderTodosPanel } from "./render.js";
import {
  expectNewSessionSurvivesOldTodoWrite,
  expectNoAutoCreatePostForBucketOnlyResponse,
  installBucketOnlyTodoFetch,
  renderTodosWithDelayedSessionSwitchWrite,
  resolveDelayedTodoWrite,
  switchCurrentSession,
} from "./scenarios.js";
import type { TodoScenario } from "./scenarioTypes.js";
import { clearCurrentSession } from "./store.js";

export const todoSessionScenarios = [
  [
    "an old in-flight todo write cannot reload todos into a new session",
    oldInFlightWriteCannotReloadNewSession,
  ],
  ["disables Add task when no session or no user is set", disablesAddTask],
  [
    "loads todos from the selected project root",
    loadsTodosFromSelectedProjectRoot,
  ],
  [
    "bucket-only /todos response (no tree) still renders items and does not auto-create",
    bucketOnlyResponseRendersItems,
  ],
] satisfies readonly TodoScenario[];

async function oldInFlightWriteCannotReloadNewSession(): Promise<void> {
  const harness = renderTodosWithDelayedSessionSwitchWrite();
  await screen.findByDisplayValue("Draft plan");

  await harness.user.click(screen.getByRole("button", { name: /Mark as done/i }));
  switchCurrentSession(harness.newSessionId);
  await screen.findByDisplayValue("New session task");

  resolveDelayedTodoWrite(harness);
  await expectNewSessionSurvivesOldTodoWrite(harness);
}

function disablesAddTask(): void {
  installTodoFetch(todoTreeRef([]));
  clearCurrentSession();
  renderTodosPanel();
  expect(screen.getByRole("button", { name: /^Add task$/i })).toBeDisabled();
}

async function loadsTodosFromSelectedProjectRoot(): Promise<void> {
  const sessionId = "2026-06-24-blocked-multi-tool";
  const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo) => {
    const url = new URL(String(input), "http://test.local");
    if (url.pathname === `/sessions/${sessionId}/todos`) {
      return jsonResponse(todoListResponse([]));
    }
    return jsonResponse({});
  });
  vi.stubGlobal("fetch", fetchMock);
  useStore.setState({
    sessions: [
      {
        id: sessionId,
        slug: "blocked-multi-tool",
        created_at: "2026-06-24T10:00:00Z",
        path: "/workspace/active",
        path_id: "active-root-id",
      },
      {
        id: sessionId,
        slug: "blocked-multi-tool",
        created_at: "2026-06-24T10:00:00Z",
        path: "/workspace/selected",
        path_id: "selected-root-id",
      },
    ],
    currentSessionId: sessionId,
    activePath: "/workspace/active",
    activePathId: "active-root-id",
    selectedPath: "/workspace/selected",
    selectedPathId: "selected-root-id",
  });

  renderTodosPanel();

  await waitFor(() => {
    const loadCall = fetchMock.mock.calls.find(([input, init]) => {
      const url = new URL(String(input), "http://test.local");
      return (
        ((init as RequestInit | undefined)?.method ?? "GET") === "GET" &&
        url.pathname === `/sessions/${sessionId}/todos`
      );
    });
    expect(loadCall).toBeTruthy();
    const url = new URL(String(loadCall![0]), "http://test.local");
    expect(url.searchParams.get("path_id")).toBe("selected-root-id");
  });
}

async function bucketOnlyResponseRendersItems(): Promise<void> {
  const { posts } = installBucketOnlyTodoFetch();
  const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    renderTodosPanel();

    expect(await screen.findByDisplayValue("From bucket")).toBeInTheDocument();
    expect(warnSpy).toHaveBeenCalledWith(
      "[todos] response missing `tree` field; deriving from buckets",
    );
    expectNoAutoCreatePostForBucketOnlyResponse(posts);
  } finally {
    warnSpy.mockRestore();
  }
}
