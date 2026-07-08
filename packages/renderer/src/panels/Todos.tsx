import { TodosView } from "./todos/TodosView.js";
import { useTodosPanelModel } from "./todos/useTodosPanelModel.js";

export function Todos(): JSX.Element {
  return <TodosView {...useTodosPanelModel()} />;
}
