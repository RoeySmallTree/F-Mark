import { useStore } from "../state/store.js";
import { Sessions } from "../panels/Sessions.js";
import { Named } from "../panels/Named.js";
import { Todos } from "../panels/Todos.js";
import { Comments } from "../panels/Comments.js";
import { Search } from "../panels/Search.js";
import { PaneResizer } from "../components/PaneResizer.js";

export function LeftPanel(): JSX.Element {
  const leftRail = useStore((s) => s.leftRail);

  /* `.left-panel-host` fills its `leftPanel` grid area; the cell size comes
     from the `--pane-w-leftPanel` / `--pane-h-leftPanel` vars on `.main`. The
     resizer's edge + axis are derived from the active placement. */
  let child: JSX.Element;
  switch (leftRail) {
    case "sessions":
      child = <Sessions />;
      break;
    case "named":
      child = <Named />;
      break;
    case "todos":
      child = <Todos />;
      break;
    case "comments":
      child = <Comments />;
      break;
    case "search":
      child = <Search />;
      break;
    default:
      child = <Sessions />;
  }

  return (
    <div className="left-panel-host">
      {child}
      <PaneResizer pane="leftPanel" />
    </div>
  );
}
