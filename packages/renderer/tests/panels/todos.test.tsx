import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, test, vi } from "vitest";
import {
  resetTodosPanelTestState,
  todoDisplayScenarios,
  todoDraftScenarios,
  todoKeyboardScenarios,
  todoMutationScenarios,
  todoSessionScenarios,
} from "./todos/helpers.js";

const todosPanelScenarios = [
  ...todoDisplayScenarios,
  ...todoMutationScenarios,
  ...todoDraftScenarios,
  ...todoKeyboardScenarios,
  ...todoSessionScenarios,
];

describe("Todos panel — unified tree item flow", () => {
  beforeEach(() => {
    resetTodosPanelTestState();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  for (const [name, run] of todosPanelScenarios) {
    test(name, run);
  }
});
