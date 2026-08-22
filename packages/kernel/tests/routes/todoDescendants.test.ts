import { describe, expect, it } from "vitest";
import { postTodo, withTodoRouteTest } from "./todos/helpers.js";

describe("GET /sessions/:id/todos/:todoId/descendants", () => {
  it("returns the children the kernel would cascade", async () => {
    await withTodoRouteTest(async (fixture) => {
      await postTodo(fixture, { id: "p", title: "parent", status: "open" });
      await postTodo(fixture, {
        id: "c",
        title: "child",
        status: "open",
        parent_id: "p",
      });
      const res = await fixture.app.inject({
        method: "GET",
        url: `/sessions/${fixture.sessionId}/todos/p/descendants`,
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().descendants).toEqual(["c"]);
    });
  });

  it("returns an empty list for a leaf", async () => {
    await withTodoRouteTest(async (fixture) => {
      await postTodo(fixture, { id: "solo", title: "solo", status: "open" });
      const res = await fixture.app.inject({
        method: "GET",
        url: `/sessions/${fixture.sessionId}/todos/solo/descendants`,
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().descendants).toEqual([]);
    });
  });
});
