import { act } from "@testing-library/react";
import type { TodoPayload } from "@f-mark/shared";
import { resetAutoFirstTodoReservations } from "../../../src/panels/todoPanelUtils.js";
import { useStore } from "../../../src/state/store.js";
import { makeTodo, resetStore } from "../../cards/_helpers.js";
import {
  DEFAULT_PARTICIPANT_ID,
  DEFAULT_TODO_EVENT_FILENAME,
} from "./fixtures.js";

export function resetTodosPanelTestState(): void {
  resetAutoFirstTodoReservations();
  resetStore();
}

export function clearCurrentSession(): void {
  useStore.setState({ currentSessionId: null });
}

export function resetStoreWithTodoEvent(
  payload: TodoPayload,
  filename = DEFAULT_TODO_EVENT_FILENAME,
): void {
  resetStore({
    events: [makeTodo(filename, DEFAULT_PARTICIPANT_ID, payload)],
  });
}

export function replaceStoreTodoEvent(
  payload: TodoPayload,
  filename = DEFAULT_TODO_EVENT_FILENAME,
): void {
  act(() => {
    useStore.setState({
      events: [makeTodo(filename, DEFAULT_PARTICIPANT_ID, payload)],
    });
  });
}
