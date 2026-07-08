import { describe, expect, it } from "vitest";
import {
  expectCreatedTodoEvent,
  expectStoredTodo,
  postTodo,
  withTodoRouteTest,
} from "./helpers.js";

export function registerPostTodoScenarios(): void {
  describe("POST /sessions/:id/events/todo", () => {
    it("creates a todo event", async () => {
      await withTodoRouteTest(async (fixture) => {
        const res = await postTodo(fixture, {
          id: "td_1",
          title: "Draft launch email",
          status: "open",
        });
        expectCreatedTodoEvent(res);
      });
    });

    it("rejects bad status enum", async () => {
      await withTodoRouteTest(async (fixture) => {
        const res = await postTodo(fixture, {
          id: "td_1",
          title: "x",
          status: "wat",
        });
        expect(res.statusCode).toBe(400);
      });
    });

    it("accepts parent_id and writes it to the event payload", async () => {
      await withTodoRouteTest(async (fixture) => {
        const res = await postTodo(fixture, {
          id: "child",
          title: "Child task",
          status: "open",
          parent_id: "parent",
        });
        expect(res.statusCode).toBe(200);
        await expectStoredTodo(fixture, res.json().filename as string, {
          parent_id: "parent",
        });
      });
    });

    it("accepts removed status", async () => {
      await withTodoRouteTest(async (fixture) => {
        const res = await postTodo(fixture, {
          id: "td_removed",
          title: "Removed task",
          status: "removed",
        });
        expect(res.statusCode).toBe(200);
        await expectStoredTodo(fixture, res.json().filename as string, {
          status: "removed",
        });
      });
    });

    it("rejects empty title", async () => {
      await withTodoRouteTest(async (fixture) => {
        const res = await postTodo(fixture, {
          id: "td_1",
          title: "",
          status: "open",
        });
        expect(res.statusCode).toBe(400);
      });
    });

    it("rejects missing session", async () => {
      await withTodoRouteTest(async (fixture) => {
        const res = await postTodo(
          fixture,
          {
            id: "td_1",
            title: "x",
            status: "open",
          },
          { sessionId: "no-such" },
        );
        expect(res.statusCode).toBe(404);
      });
    });
  });
}
