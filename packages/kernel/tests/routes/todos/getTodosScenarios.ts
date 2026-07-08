import { registerTodoFilterScenarios } from "./getTodosScenarios/filterScenarios.js";
import { registerTodoOrderingScenarios } from "./getTodosScenarios/orderingScenarios.js";
import { registerTodoTreeScenarios } from "./getTodosScenarios/treeScenarios.js";

export function registerGetTodosScenarios(): void {
  registerTodoOrderingScenarios();
  registerTodoFilterScenarios();
  registerTodoTreeScenarios();
}
