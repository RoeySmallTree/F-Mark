import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, vi } from "vitest";
import { resetStore } from "./_helpers.js";
import { registerTodoKeyboardTests } from "./todo/keyboardCases.js";
import { registerTodoMutationTests } from "./todo/mutationCases.js";
import { registerTodoRenderingTests } from "./todo/renderingCases.js";

describe("TodoCard", () => {
  beforeEach(() => {
    resetStore();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  registerTodoRenderingTests();
  registerTodoMutationTests();
  registerTodoKeyboardTests();
});
