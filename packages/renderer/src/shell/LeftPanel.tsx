import { useStore } from "../state/store.js";
import { Sessions } from "../panels/Sessions.js";
import { Named } from "../panels/Named.js";
import { Todos } from "../panels/Todos.js";
import { Comments } from "../panels/Comments.js";
import { Search } from "../panels/Search.js";

export function LeftPanel(): JSX.Element {
  const leftRail = useStore((s) => s.leftRail);
  switch (leftRail) {
    case "sessions":
      return <Sessions />;
    case "named":
      return <Named />;
    case "todos":
      return <Todos />;
    case "comments":
      return <Comments />;
    case "search":
      return <Search />;
    default:
      return <Sessions />;
  }
}
