import type { ReactElement } from "react";
import type { RenderResult } from "@testing-library/react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TodoTreeNode } from "@f-mark/shared";
import { Todos } from "../../../src/panels/Todos.js";
import { RightTodos } from "../../../src/panels/right/RightTodos.js";
import { installTodoFetch } from "./fetch.js";
import {
  todoTreeRef,
  type TodoPost,
  type TodoTreeRef,
} from "./fixtures.js";

type RenderTodosOptions = {
  ui?: ReactElement;
  waitForTitle?: string | false;
};

export type TodoPanelUser = ReturnType<typeof userEvent.setup>;

type RenderTodosResult = RenderResult & {
  posts: TodoPost[];
  title: HTMLElement | undefined;
  treeRef: TodoTreeRef;
  user: TodoPanelUser;
};

export function renderTodosPanel(): RenderResult {
  return render(<Todos />);
}

export async function renderTodosWithTree(
  tree: TodoTreeNode[],
  { ui = <Todos />, waitForTitle = "Draft plan" }: RenderTodosOptions = {},
): Promise<RenderTodosResult> {
  const treeRef = todoTreeRef(tree);
  const { posts } = installTodoFetch(treeRef);
  const user = userEvent.setup();
  const view = render(ui);
  const title =
    waitForTitle === false
      ? undefined
      : await screen.findByDisplayValue(waitForTitle);

  return { ...view, posts, title, treeRef, user };
}

export function renderRightTodos(): ReactElement {
  return <RightTodos />;
}
