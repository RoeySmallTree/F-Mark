import { describe, expect, it } from "vitest";
import {
  expectTodoIds,
  expectVisibleTodoIds,
  getTodoEvents,
  getTodos,
  postTodo,
  postTodos,
  todoEventsBody,
  todosBody,
  withTodoRouteTest,
} from "../helpers.js";

export function registerTodoTreeScenarios(): void {
  describe("GET /sessions/:id/todos", () => {
    it("cascades removed status to transitive descendants", async () => {
      await withTodoRouteTest(async (fixture) => {
        const parentRes = await postTodo(fixture, {
          id: "parent",
          title: "Parent",
          status: "open",
        });
        const childRes = await postTodo(fixture, {
          id: "child",
          title: "Child",
          status: "open",
          parent_id: "parent",
        });
        const grandchildRes = await postTodo(fixture, {
          id: "grandchild",
          title: "Grandchild",
          status: "wip",
          parent_id: "child",
        });
        await postTodo(fixture, {
          id: "sibling",
          title: "Sibling",
          status: "open",
        });

        const removeRes = await postTodo(fixture, {
          id: "parent",
          title: "Parent",
          status: "removed",
          supersedes: parentRes.json().filename as string,
        });
        expect(removeRes.statusCode).toBe(200);

        const res = await getTodos(fixture);
        expect(res.statusCode).toBe(200);
        const body = todosBody(res);
        expectVisibleTodoIds(body, ["sibling"]);
        expectTodoIds(body.tree, ["sibling"]);

        const removedEvents = todoEventsBody(await getTodoEvents(fixture)).filter(
          (event) => event.payload.status === "removed",
        );
        const removedById = new Map(
          removedEvents.map((event) => [event.payload.id, event]),
        );
        expect(Array.from(removedById.keys()).sort()).toEqual([
          "child",
          "grandchild",
          "parent",
        ]);
        expect(removedById.get("child")?.participant_id).toBe(fixture.pid);
        expect(removedById.get("child")?.payload.supersedes).toBe(
          childRes.json().filename,
        );
        expect(removedById.get("grandchild")?.participant_id).toBe(fixture.pid);
        expect(removedById.get("grandchild")?.payload.supersedes).toBe(
          grandchildRes.json().filename,
        );
      });
    });

    it("returns tree nesting in creation order and promotes orphans", async () => {
      await withTodoRouteTest(async (fixture) => {
        await postTodos(fixture, [
          {
            id: "parent",
            title: "Parent",
            body: "Parent body",
            status: "open",
          },
          {
            id: "child-1",
            title: "Child 1",
            body: "Child body",
            status: "wip",
            parent_id: "parent",
          },
          {
            id: "grandchild",
            title: "Grandchild",
            status: "done",
            parent_id: "child-1",
          },
          {
            id: "child-2",
            title: "Child 2",
            status: "open",
            parent_id: "parent",
          },
          {
            id: "sibling",
            title: "Sibling root",
            status: "open",
          },
        ]);
        const removedParentRes = await postTodo(fixture, {
          id: "removed-parent",
          title: "Removed parent",
          status: "open",
        });
        await postTodo(fixture, {
          id: "removed-parent",
          title: "Removed parent",
          status: "removed",
          supersedes: removedParentRes.json().filename as string,
        });
        await postTodo(fixture, {
          id: "orphan-child",
          title: "Orphan child",
          status: "open",
          parent_id: "removed-parent",
        });

        const res = await getTodos(fixture);
        expect(res.statusCode).toBe(200);
        const body = todosBody(res);
        expectTodoIds(body.tree, ["parent", "sibling", "orphan-child"]);

        const parent = body.tree[0]!;
        expect(parent.body).toBe("Parent body");
        expectTodoIds(parent.children, ["child-1", "child-2"]);
        expect(parent.children[0]?.body).toBe("Child body");
        expectTodoIds(parent.children[0]?.children ?? [], ["grandchild"]);

        const orphan = body.tree[2]!;
        expect(orphan.parent_id).toBe("removed-parent");
        expect(JSON.stringify(body.tree)).not.toContain('"status":"removed"');
      });
    });
  });
}
