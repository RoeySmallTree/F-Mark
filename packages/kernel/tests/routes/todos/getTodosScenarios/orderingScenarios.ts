import { describe, expect, it } from "vitest";
import {
  createTodoAgent,
  expectTodoIds,
  getTodoEvents,
  getTodos,
  postTodo,
  postTodos,
  todoEventsBody,
  todosBody,
  withTodoRouteTest,
} from "../helpers.js";

export function registerTodoOrderingScenarios(): void {
  describe("GET /sessions/:id/todos", () => {
    it("groups by status, returns latest per id", async () => {
      await withTodoRouteTest(async (fixture) => {
        await postTodos(fixture, [
          { id: "a", title: "A", status: "open" },
          { id: "b", title: "B", status: "wip" },
        ]);

        const events1 = todoEventsBody(await getTodoEvents(fixture));
        const aFilename = events1.find((event) => event.payload.id === "a")!
          .filename;
        const supRes = await postTodo(fixture, {
          id: "a",
          title: "A",
          status: "done",
          supersedes: aFilename,
        });
        expect(supRes.statusCode).toBe(200);

        const res = await getTodos(fixture);
        expect(res.statusCode).toBe(200);
        const body = todosBody(res);
        expect(body.open).toEqual([]);
        expectTodoIds(body.wip, ["b"]);
        expectTodoIds(body.done, ["a"]);
      });
    });

    it("groups tree siblings by status and then assignee", async () => {
      await withTodoRouteTest(async (fixture) => {
        const owner = await createTodoAgent(fixture, {
          name: "Owner",
          suggested_id: "ag-alpha",
        });
        const other = await createTodoAgent(fixture, {
          name: "Other",
          suggested_id: "ag-zulu",
        });
        await postTodos(fixture, [
          {
            id: "open-other",
            title: "Open other",
            status: "open",
            assigned_to: other.id,
          },
          {
            id: "done-owner",
            title: "Done owner",
            status: "done",
            assigned_to: owner.id,
          },
          {
            id: "wip-other",
            title: "WIP other",
            status: "wip",
            assigned_to: other.id,
          },
          {
            id: "open-owner",
            title: "Open owner",
            status: "open",
            assigned_to: owner.id,
          },
        ]);

        const res = await getTodos(fixture);

        expect(res.statusCode).toBe(200);
        expectTodoIds(todosBody(res).tree, [
          "wip-other",
          "open-owner",
          "open-other",
          "done-owner",
        ]);
      });
    });

    it("returns latest version per id and sorts newest-first", async () => {
      await withTodoRouteTest(async (fixture) => {
        await postTodos(fixture, [
          { id: "a", title: "Old", status: "open" },
          { id: "a", title: "New", status: "open" },
          { id: "c", title: "C", status: "open" },
        ]);

        const res = await getTodos(fixture);
        const body = todosBody(res);
        expect(body.open).toHaveLength(2);
        expect(body.open[0]?.id).toBe("c");
        const aEntry = body.open.find((todo) => todo.id === "a");
        expect(aEntry?.title).toBe("New");
      });
    });
  });
}
