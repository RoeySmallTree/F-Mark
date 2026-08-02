import {
  Braces,
  Clipboard,
  Code,
  Copy,
  Download,
  FileSearch,
  FileText,
  FolderOpen,
  FolderSearch,
  GitBranch,
  List,
  Network,
  Package,
  SearchCode,
  SquareTerminal,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { iconForTool } from "../../feed/toolIcons.js";

export const TOOL_BODY_MAX_HEIGHT = 360;

/* How long the body stays mounted after close so the grid-row collapse
   (cards.css `.tool-disclosure`, exit leg) has time to finish before the
   content unmounts. Mirrors that rule's exit duration, --dur-instant. */
export const TOOL_DISCLOSURE_EXIT_MS = 120;

export interface ToolType {
  cls: string;
  label: string;
}

const toolIconKeys = {
  terminal: "Terminal",
} as const;

const toolTypeVariants = {
  bash: { cls: "t-bash", label: "Bash" },
  read: { cls: "t-read", label: "Read" },
  search: { cls: "t-grep", label: "Search" },
  edit: { cls: "t-edit", label: "Edit" },
  fetch: { cls: "t-fetch", label: "Fetch" },
  fallback: { cls: "t-bash", label: "Tool" },
} as const satisfies Record<string, ToolType>;

const toolCallClassNames = {
  root: "tool-call",
  error: "error",
  internal: "internal",
  empty: "",
  joiner: " ",
} as const;

/** Map a tool to a reference `.tool-type` variant (dot colour + short label). */
export function toolType(toolName: string): ToolType {
  switch (iconForTool(toolName)) {
    case toolIconKeys.terminal:
      return toolTypeVariants.bash;
    case "FileText":
    case "BookOpen":
      return toolTypeVariants.read;
    case "Search":
    case "Filter":
      return toolTypeVariants.search;
    case "Edit3":
    case "FilePlus":
      return toolTypeVariants.edit;
    case "Globe":
      return toolTypeVariants.fetch;
    default:
      return toolTypeVariants.fallback;
  }
}

export function formatDuration(ms: number | undefined): string | null {
  if (ms === undefined) return null;
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

export function summaryTitle(title: string, detail: string | undefined): string {
  return detail === undefined ? title : `${title} ${detail}`;
}

const COMMAND_ICON_POOL: Record<string, LucideIcon> = {
  awk: Braces,
  bun: Package,
  cat: FileText,
  cd: FolderOpen,
  cp: Copy,
  curl: Download,
  docker: Package,
  find: FolderSearch,
  git: GitBranch,
  grep: SearchCode,
  head: List,
  jq: Braces,
  ls: List,
  mkdir: FolderOpen,
  mv: Copy,
  node: Package,
  npm: Package,
  pnpm: Package,
  ps: SquareTerminal,
  pwd: FolderOpen,
  rg: SearchCode,
  rm: Trash2,
  sed: Braces,
  ssh: Network,
  tail: List,
  tar: Package,
  tee: Clipboard,
  touch: FileText,
  unzip: Package,
  wget: Download,
  which: FileSearch,
  yarn: Package,
  zip: Package,
};

export function commandIcon(toolName: string, title: string): LucideIcon | null {
  if (iconForTool(toolName) !== toolIconKeys.terminal) return null;
  const commandName = title.toLowerCase();
  return COMMAND_ICON_POOL[commandName] ?? Code;
}

export function toolCallClasses(
  success: boolean,
  compactInternal: boolean | undefined,
): string {
  return [
    toolCallClassNames.root,
    success ? toolCallClassNames.empty : toolCallClassNames.error,
    compactInternal === true
      ? toolCallClassNames.internal
      : toolCallClassNames.empty,
  ]
    .filter((className) => className.length > 0)
    .join(toolCallClassNames.joiner);
}
