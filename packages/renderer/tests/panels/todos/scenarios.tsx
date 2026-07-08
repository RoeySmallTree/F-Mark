import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, vi } from "vitest";
import { Todos } from "../../../src/panels/Todos.js";
import { useStore } from "../../../src/state/store.js";
import { jsonResponse, resetStore } from "../../cards/_helpers.js";
import { installTodoFetchMock } from "./fetch.js";
import {
  singleTree,
  todoListResponse,
  todoTreeRef,
  type TodoPost,
} from "./fixtures.js";
import type { TodoPanelUser } from "./render.js";

type DelayedSessionWriteHarness = {
  fetchMock: ReturnType<typeof vi.fn>;
  newSessionId: string;
  oldSessionId: string;
  resolvePost: (response: Response) => void;
  user: TodoPanelUser;
};

export function installEmptySessionDraftFetch(): { posts: TodoPost[] } {
  const treeRef = todoTreeRef([]);
  return installTodoFetchMock({
    readTodos: () => todoListResponse(treeRef.current),
    writeTodo: (body) => {
      treeRef.current = [
        {
          id: String(body.id),
          title: String(body.title),
          status: "open",
          assigned_to: String(body.assigned_to),
          children: [],
        },
      ];
      return { filename: "20260522T120000Z_us-a7f3.todo.json" };
    },
  });
}

export function installBucketOnlyTodoFetch(): { posts: TodoPost[] } {
  return installTodoFetchMock({
    readTodos: () => ({
      open: [
        {
          id: "t-bucket",
          title: "From bucket",
          status: "open",
        },
      ],
      wip: [],
      done: [],
    }),
  });
}

export function expectNoAutoCreatePostForBucketOnlyResponse(
  posts: TodoPost[],
): void {
  expect(
    posts.some(
      (post) =>
        post.id !== "t-bucket" && post.participant_id !== undefined,
    ),
  ).toBe(false);
}

export function renderTodosWithDelayedSessionSwitchWrite(): DelayedSessionWriteHarness {
  const oldSessionId = "2026-05-22-launch-review";
  const newSessionId = "2026-05-23-new-session";
  let resolvePost: (response: Response) => void = () => undefined;
  const postPromise = new Promise<Response>((resolve) => {
    resolvePost = resolve;
  });
  const fetchMock = vi.fn().mockImplementation(async (
    input: RequestInfo,
    init?: RequestInit,
  ) => {
    const url = typeof input === "string" ? input : input.toString();
    if (
      url.includes(`/sessions/${oldSessionId}/events/todo`) &&
      (init?.method ?? "GET") === "POST"
    ) {
      return postPromise;
    }
    if (url.includes(`/sessions/${oldSessionId}/todos`)) {
      return jsonResponse(todoListResponse(singleTree()));
    }
    if (url.includes(`/sessions/${newSessionId}/todos`)) {
      return jsonResponse(
        todoListResponse([
          {
            id: "new-task",
            title: "New session task",
            status: "open",
            children: [],
          },
        ]),
      );
    }
    return jsonResponse({});
  });

  vi.stubGlobal("fetch", fetchMock);
  resetStore({
    sessions: [
      {
        id: oldSessionId,
        slug: "launch-review",
        created_at: "2026-05-22T10:00:00Z",
      },
      {
        id: newSessionId,
        slug: "new-session",
        created_at: "2026-05-23T10:00:00Z",
      },
    ],
    currentSessionId: oldSessionId,
  });

  const user = userEvent.setup();
  render(<Todos />);
  return { fetchMock, newSessionId, oldSessionId, resolvePost, user };
}

export function switchCurrentSession(sessionId: string): void {
  act(() => {
    useStore.getState().setCurrentSession(sessionId);
  });
}

export function resolveDelayedTodoWrite({
  resolvePost,
}: DelayedSessionWriteHarness): void {
  resolvePost(jsonResponse({ filename: "20260522T110100Z_us.todo.json" }));
}

export async function expectNewSessionSurvivesOldTodoWrite({
  fetchMock,
  oldSessionId,
}: DelayedSessionWriteHarness): Promise<void> {
  await waitFor(() => {
    const oldLoads = fetchMock.mock.calls.filter(([input]) =>
      String(input).includes(`/sessions/${oldSessionId}/todos`),
    );
    expect(oldLoads).toHaveLength(1);
    expect(screen.getByDisplayValue("New session task")).toBeInTheDocument();
  });
  expect(screen.queryByDisplayValue("Draft plan")).toBeNull();
}
