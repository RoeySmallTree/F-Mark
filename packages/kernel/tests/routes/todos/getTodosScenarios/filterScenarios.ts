import { describe, expect, it } from "vitest";
import {
  createTodoAgent,
  expectTodoIds,
  getTodos,
  postTodos,
  todosBody,
  withTodoRouteTest,
} from "../helpers.js";

export function registerTodoFilterScenarios(): void {
  describe("GET /sessions/:id/todos", () => {
    it("filters by assigned_to", async () => {
      await withTodoRouteTest(async (fixture) => {
        const agent = await createTodoAgent(fixture, { name: "AgentX" });
        await postTodos(fixture, [
          {
            id: "a",
            title: "A",
            status: "open",
            assigned_to: fixture.pid,
          },
          {
            id: "b",
            title: "B",
            status: "open",
            assigned_to: agent.id,
          },
        ]);

        const res = await getTodos(fixture, { assigned_to: fixture.pid });
        const body = todosBody(res);
        expectTodoIds(body.open, ["a"]);
        expectTodoIds(body.tree, ["a"]);
      });
    });

    it("annotates viewer ownership without hiding other todos", async () => {
      await withTodoRouteTest(async (fixture) => {
        const owner = await createTodoAgent(fixture, { name: "Owner" });
        const other = await createTodoAgent(fixture, { name: "Other" });
        await postTodos(fixture, [
          {
            id: "owned-parent",
            title: "Owned parent",
            body: "Parent description for the model",
            status: "open",
            assigned_to: owner.id,
          },
          {
            id: "other-child",
            title: "Other child",
            body: "Child description for the model",
            status: "open",
            assigned_to: other.id,
            parent_id: "owned-parent",
          },
          {
            id: "unassigned",
            title: "Unassigned",
            status: "wip",
          },
        ]);

        const res = await getTodos(fixture, { viewer: owner.id });

        expect(res.statusCode).toBe(200);
        const body = todosBody(res);
        expect(body.viewer).toBe(owner.id);
        expect(body.open).toHaveLength(2);
        expect(body.wip).toHaveLength(1);

        const parent = body.tree.find((todo) => todo.id === "owned-parent");
        expect(parent).toMatchObject({
          id: "owned-parent",
          body: "Parent description for the model",
          owned_by_viewer: true,
          ownership: "owned",
        });
        expect(parent?.children[0]).toMatchObject({
          id: "other-child",
          body: "Child description for the model",
          assigned_to: other.id,
          owned_by_viewer: false,
          ownership: "NOT owned",
        });
        expect(body.wip[0]).toMatchObject({
          id: "unassigned",
          owned_by_viewer: false,
          ownership: "NOT owned",
        });
      });
    });

    it("returns 404 on missing session", async () => {
      await withTodoRouteTest(async (fixture) => {
        const res = await getTodos(fixture, { sessionId: "missing" });
        expect(res.statusCode).toBe(404);
      });
    });
  });
}
