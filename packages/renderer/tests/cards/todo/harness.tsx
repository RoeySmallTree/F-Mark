import type { AnyEventRecord, TodoPayload } from "@f-mark/shared";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  type RenderResult,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, vi, type MockInstance } from "vitest";
import { TodoCard } from "../../../src/cards/TodoCard.js";
import { TodoItem } from "../../../src/cards/TodoItem.js";
import type { TodoItemNode } from "../../../src/cards/TodoItem.js";
import type { TodoItemProps } from "../../../src/cards/todoItem/types.js";
import { PARTICIPANTS, jsonResponse, makeTodo } from "../_helpers.js";

export type FetchMock = MockInstance<typeof fetch>;
export type PostedTodoBody = Record<string, unknown>;

type FetchInput = Parameters<typeof fetch>[0];
type FetchInit = Parameters<typeof fetch>[1];
type TodoKeyOptions = {
  code?: string;
  metaKey?: boolean;
};

const USER_PARTICIPANT_ID = "us-a7f3";
const TODO_POST_URL = /\/events\/todo$/;
const WAKE_URL = /\/sessions\/2026-05-22-launch-review\/wake$/;

const BASE_TODO_FILENAME = "20260522T110000Z_us-a7f3.todo.json";

export function todoEvent(
  payload: TodoPayload,
  filename = BASE_TODO_FILENAME,
  participantId = USER_PARTICIPANT_ID,
): AnyEventRecord {
  return makeTodo(filename, participantId, payload);
}

export function renderTodoCard(
  event: AnyEventRecord,
  allEvents?: AnyEventRecord[],
): RenderResult {
  return render(
    <TodoCard
      event={event}
      participants={PARTICIPANTS}
      allEvents={allEvents}
    />,
  );
}

export function makeTodoItemNode(
  overrides: Partial<TodoItemNode> = {},
): TodoItemNode {
  return {
    id: "t1",
    title: "Cull stale note",
    status: "open",
    children: [],
    ...overrides,
  };
}

/** Renders TodoItem directly with mocked handlers, bypassing TodoCard's
    kernel wiring. Needed to observe args (like the removal `field`) that
    TodoCard's own onRemove wiring discards. */
export function renderTodoItemDirect(
  overrides: Partial<TodoItemProps> = {},
): RenderResult {
  const props: TodoItemProps = {
    node: makeTodoItemNode(),
    depth: 0,
    participants: PARTICIPANTS,
    agentIds: [],
    onUpdate: vi.fn().mockResolvedValue(undefined),
    onToggleDone: vi.fn().mockResolvedValue(undefined),
    onToggleWip: vi.fn().mockResolvedValue(undefined),
    onRemove: vi.fn().mockResolvedValue(undefined),
    onAddSubtask: vi.fn(),
    onReassign: vi.fn().mockResolvedValue(undefined),
    fetchDescendants: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
  return render(<TodoItem {...props} />);
}

export function setupTodoCard(
  payload: TodoPayload,
  filename = BASE_TODO_FILENAME,
): {
  event: AnyEventRecord;
  user: ReturnType<typeof userEvent.setup>;
} & RenderResult {
  const event = todoEvent(payload, filename);
  return {
    event,
    user: userEvent.setup(),
    ...renderTodoCard(event),
  };
}

const DESCENDANTS_URL = /\/todos\/[^/]+\/descendants/;

export function stubTodoFetch(filename: string): FetchMock {
  const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
    if (DESCENDANTS_URL.test(String(input))) {
      return jsonResponse({ descendants: [] });
    }
    return jsonResponse({ filename });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** The descendants lookup rejects (server 500); removal must not depend on
    it succeeding — the confirmation still has to appear and removal still
    has to go through, just with a degraded (zero) descendant count. */
export function stubTodoFetchWithFailingDescendants(filename: string): FetchMock {
  const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
    if (DESCENDANTS_URL.test(String(input))) {
      return jsonResponse({ error: "descendants lookup failed" }, 500);
    }
    return jsonResponse({ filename });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

export function stubConfirm(result: boolean): MockInstance<typeof window.confirm> {
  const confirmMock = vi.fn<typeof window.confirm>().mockReturnValue(result);
  vi.stubGlobal("confirm", confirmMock);
  return confirmMock;
}

export function stubRecordingTodoFetch(filename: string): {
  fetchMock: FetchMock;
  posted: PostedTodoBody[];
} {
  const posted: PostedTodoBody[] = [];
  const fetchMock = vi.fn(async (_input: FetchInput, init?: FetchInit) => {
    posted.push(parsePostedBodyFromInit(init));
    return jsonResponse({ filename });
  }) as FetchMock;
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, posted };
}

export function postedBody(
  fetchMock: FetchMock,
  index = 0,
): PostedTodoBody {
  return parsePostedBodyFromInit(fetchMock.mock.calls[index]?.[1]);
}

function postedUrl(fetchMock: FetchMock, index = 0): string {
  return String(fetchMock.mock.calls[index]?.[0] ?? "");
}

export function expectTodoPost(
  fetchMock: FetchMock,
  expected: PostedTodoBody,
  index = 0,
): void {
  const init = fetchMock.mock.calls[index]?.[1];
  expect(postedUrl(fetchMock, index)).toMatch(TODO_POST_URL);
  expect(init?.method).toBe("POST");
  expect(postedBody(fetchMock, index)).toMatchObject(expected);
}

export function expectWakeCall(fetchMock: FetchMock, index = 1): void {
  expect(postedUrl(fetchMock, index)).toMatch(WAKE_URL);
}

export function expectDescendantsCall(fetchMock: FetchMock, index = 0): void {
  expect(postedUrl(fetchMock, index)).toMatch(DESCENDANTS_URL);
}

export async function waitForFetchCalls(
  fetchMock: FetchMock,
  callCount: number,
): Promise<void> {
  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalledTimes(callCount);
  });
}

export async function waitForPostedCount(
  posted: PostedTodoBody[],
  count: number,
): Promise<void> {
  await waitFor(() => {
    expect(posted.length).toBe(count);
  });
}

export function taskTitleField(): HTMLElement {
  return screen.getByLabelText("Task title");
}

export function taskDescriptionField(): HTMLElement {
  return screen.getByLabelText("Task description");
}

export async function replaceField(
  user: ReturnType<typeof userEvent.setup>,
  field: HTMLElement,
  value: string,
): Promise<void> {
  await user.clear(field);
  await user.type(field, value);
}

export function pressTodoKey(
  field: HTMLElement,
  key: string,
  options: TodoKeyOptions = {},
): boolean {
  return fireEvent.keyDown(field, {
    key,
    code: options.code ?? key,
    metaKey: options.metaKey,
  });
}

export function draftTitleField(container: HTMLElement): HTMLTextAreaElement {
  const draft = container.querySelector('.todo-item[data-draft="true"]');
  expect(draft).not.toBeNull();
  expect(draft?.getAttribute("data-depth")).toBe("1");
  const title = draft?.querySelector<HTMLTextAreaElement>("textarea.todo-title");
  expect(title).not.toBeNull();
  return title as HTMLTextAreaElement;
}

function parsePostedBodyFromInit(init: FetchInit): PostedTodoBody {
  return JSON.parse(String(init?.body ?? "{}")) as PostedTodoBody;
}
