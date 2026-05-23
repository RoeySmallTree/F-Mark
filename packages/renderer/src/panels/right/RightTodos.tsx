import { TodoTreeList } from "../TodoTreeList.js";

export function RightTodos(): JSX.Element {
  return (
    <TodoTreeList
      className="todo-right-list"
      compact
      showCounts
    />
  );
}
