import { expect } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { paths } from "../../../src/paths.js";
import { createSession } from "../../../src/sessions.js";
import {
  listParticipants,
  registerAgent,
} from "../../../src/participants.js";
import { withTempSessionApp } from "../sessions/helpers.js";

type SessionPaths = ReturnType<typeof paths>;

export interface TodoRouteFixture {
  app: FastifyInstance;
  p: SessionPaths;
  pid: string;
  root: string;
  sessionId: string;
}

export interface TodoInput {
  id: string;
  title: string;
  status: string;
  assigned_to?: string;
  body?: string;
  parent_id?: string;
  supersedes?: string;
}

export interface TodoResponseItem {
  id: string;
  assigned_to?: string;
  body?: string;
  children: TodoResponseItem[];
  owned_by_viewer?: boolean;
  ownership?: string;
  parent_id?: string;
  status?: string;
  title?: string;
}

export interface TodosResponse {
  done: TodoResponseItem[];
  open: TodoResponseItem[];
  tree: TodoResponseItem[];
  viewer?: string;
  wip: TodoResponseItem[];
}

export interface TodoEventListItem {
  filename: string;
  participant_id: string;
  payload: TodoInput;
}

async function setupTodoRoute({
  app,
  p,
  root,
}: Pick<TodoRouteFixture, "app" | "p" | "root">): Promise<TodoRouteFixture> {
  const session = await createSession(p, { slug: "x" });
  const [pid] = Object.keys(await listParticipants(p));
  return { app, p, pid: pid!, root, sessionId: session.id };
}

export async function withTodoRouteTest<T>(
  fn: (fixture: TodoRouteFixture) => Promise<T>,
): Promise<T> {
  return withTempSessionApp(async ({ app, p, root }) => {
    const fixture = await setupTodoRoute({ app, p, root });
    return fn(fixture);
  });
}

export async function createTodoAgent(
  fixture: Pick<TodoRouteFixture, "p">,
  options: Parameters<typeof registerAgent>[1],
) {
  return registerAgent(fixture.p, options);
}

export async function postTodo(
  fixture: TodoRouteFixture,
  todo: TodoInput,
  options: { sessionId?: string } = {},
) {
  return fixture.app.inject({
    method: "POST",
    url: `/sessions/${options.sessionId ?? fixture.sessionId}/events/todo`,
    payload: {
      root: fixture.root,
      participant_id: fixture.pid,
      ...todo,
    },
  });
}

export async function postTodos(
  fixture: TodoRouteFixture,
  todos: readonly TodoInput[],
): Promise<void> {
  for (const todo of todos) {
    await postTodo(fixture, todo);
  }
}

export async function getTodos(
  fixture: TodoRouteFixture,
  options: { assigned_to?: string; sessionId?: string; viewer?: string } = {},
) {
  const { sessionId = fixture.sessionId, ...query } = options;
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      search.set(key, value);
    }
  }
  const suffix = search.size > 0 ? `?${search}` : "";
  return fixture.app.inject({
    method: "GET",
    url: `/sessions/${sessionId}/todos${suffix}`,
  });
}

export async function getTodoEvents(fixture: TodoRouteFixture) {
  return fixture.app.inject({
    method: "GET",
    url: `/sessions/${fixture.sessionId}/events?root=${encodeURIComponent(
      fixture.root,
    )}&kinds=todo`,
  });
}

export function todosBody(res: { json(): unknown }): TodosResponse {
  return res.json() as TodosResponse;
}

export function todoEventsBody(res: { json(): unknown }): TodoEventListItem[] {
  return (res.json() as { events: TodoEventListItem[] }).events;
}

export function expectCreatedTodoEvent(res: {
  json(): unknown;
  statusCode: number;
}): void {
  expect(res.statusCode).toBe(200);
  const body = res.json() as { filename: string; kind: string };
  expect(body.filename).toMatch(/\.todo\.json$/);
  expect(body.kind).toBe("todo");
}

export function expectTodoIds(
  todos: readonly Pick<TodoResponseItem, "id">[],
  expected: string[],
): void {
  expect(todos.map((todo) => todo.id)).toEqual(expected);
}

export function expectVisibleTodoIds(
  body: Pick<TodosResponse, "done" | "open" | "wip">,
  expected: string[],
): void {
  expectTodoIds([...body.open, ...body.wip, ...body.done], expected);
}

export async function expectStoredTodo(
  fixture: Pick<TodoRouteFixture, "p" | "sessionId">,
  filename: string,
  expected: Partial<TodoInput>,
): Promise<void> {
  const onDisk = JSON.parse(
    await readFile(
      join(fixture.p.sessionDir(fixture.sessionId), filename),
      "utf8",
    ),
  ) as TodoInput;
  expect(onDisk).toMatchObject(expected);
}
