import type { TodoListResponse } from "../../../src/api/client.js";
import { jsonResponse } from "../../cards/_helpers.js";
import { vi } from "vitest";
import {
  todoListResponse,
  type TodoPost,
  type TodoTreeRef,
} from "./fixtures.js";

type TodoFetchMockOptions = {
  readTodos: () => Partial<TodoListResponse>;
  writeTodo?: (body: TodoPost, postCount: number) => unknown;
};

export function installTodoFetch(treeRef: TodoTreeRef): { posts: TodoPost[] } {
  return installTodoFetchMock({
    readTodos: () => todoListResponse(treeRef.current),
    writeTodo: (_body, postCount) => ({
      filename: `20260522T120${String(postCount).padStart(3, "0")}Z_us-a7f3.todo.json`,
    }),
  });
}

export function installTodoFetchMock({
  readTodos,
  writeTodo = () => ({ filename: "x.todo.json" }),
}: TodoFetchMockOptions): { posts: TodoPost[] } {
  const posts: TodoPost[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(async (input: RequestInfo, init?: RequestInit) => {
      const url = requestUrl(input);
      if (isTodoPost(url, init)) {
        const body = parseTodoPost(init);
        posts.push(body);
        return jsonResponse(writeTodo(body, posts.length));
      }
      if (url.includes("/todos")) {
        return jsonResponse(readTodos());
      }
      return jsonResponse({});
    }),
  );
  return { posts };
}

function requestUrl(input: RequestInfo): string {
  return typeof input === "string" ? input : input.toString();
}

function isTodoPost(url: string, init?: RequestInit): boolean {
  return url.includes("/events/todo") && (init?.method ?? "GET") === "POST";
}

function parseTodoPost(init?: RequestInit): TodoPost {
  return JSON.parse(String(init?.body ?? "{}")) as TodoPost;
}
