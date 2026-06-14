import type { ReactNode } from "react";
import {
  Bot,
  CheckSquare,
  FileText,
  FolderTree,
  MessageSquare,
} from "lucide-react";
import type { RightTabKey } from "../../state/store.js";

interface TabMeta {
  label: string;
  /* null = render the label without a leading icon (Log preserves its
     icon-less treatment from the pre-Layout strip). */
  icon: ReactNode | null;
}

/* Shared icon + label registry for the right-pane tabs. Used by both
   RightPanel (to render the strip) and RightLayout (to render the
   reorderable list). Keeping a single source avoids icon/label drift. */
export const RIGHT_TAB_META: Record<RightTabKey, TabMeta> = {
  todos: { label: "Todos", icon: <CheckSquare size={12} aria-hidden="true" /> },
  comments: {
    label: "Comments",
    icon: <MessageSquare size={12} aria-hidden="true" />,
  },
  named: { label: "Named", icon: <FileText size={12} aria-hidden="true" /> },
  agents: { label: "Agents", icon: <Bot size={12} aria-hidden="true" /> },
  log: { label: "Log", icon: null },
  files: {
    label: "Files",
    icon: <FolderTree size={12} aria-hidden="true" />,
  },
};
