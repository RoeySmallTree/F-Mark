import {
  CheckSquare,
  FileText,
  Folder,
  MessageSquare,
  Search,
} from "lucide-react";
import { useStore } from "../state/store.js";
import type { LeftRailKey } from "../state/store.js";

interface RailItem {
  id: LeftRailKey;
  label: string;
  icon: JSX.Element;
}

const ITEMS: RailItem[] = [
  { id: "sessions", label: "Sessions", icon: <Folder size={17} /> },
  { id: "named", label: "Named", icon: <FileText size={17} /> },
  { id: "todos", label: "Todos", icon: <CheckSquare size={17} /> },
  { id: "comments", label: "Comments", icon: <MessageSquare size={17} /> },
  { id: "search", label: "Search", icon: <Search size={17} /> },
];

export function LeftRail(): JSX.Element {
  const leftRail = useStore((s) => s.leftRail);
  const setLeftRail = useStore((s) => s.setLeftRail);
  return (
    <nav
      className="left-rail"
      role="tablist"
      aria-label="Left panel navigation"
    >
      {ITEMS.map((it) => {
        const active = leftRail === it.id;
        return (
          <button
            key={it.id}
            type="button"
            role="tab"
            aria-selected={active}
            className={["rail-btn", active ? "active" : ""].join(" ").trim()}
            title={it.label}
            aria-label={it.label}
            onClick={() => setLeftRail(it.id)}
          >
            {it.icon}
          </button>
        );
      })}
    </nav>
  );
}
