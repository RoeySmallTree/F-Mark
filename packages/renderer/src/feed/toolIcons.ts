/* Tool-name → lucide-react icon-component name mapping for ToolUseCard.
   Lookup is case-insensitive so we accept whatever casing the runtime
   emits (e.g. "Bash", "bash", "BASH"). The returned string is a PascalCase
   lucide-react export name (Terminal, FileText, …) so call sites can index
   into a small `{ name → Component }` map without juggling kebab-case.
   Unknown tools fall back to Wrench, matching RightLog's tool-use glyph. */

export const DEFAULT_TOOL_ICON = "Wrench";

const MAP: Record<string, string> = {
  bash: "Terminal",
  read: "FileText",
  edit: "Edit3",
  write: "FilePlus",
  webfetch: "Globe",
  websearch: "Search",
  glob: "Filter",
  grep: "Search",
  task: "Users",
  notebookedit: "BookOpen",
  todowrite: "ListChecks",
};

export function iconForTool(name: string): string {
  return MAP[name.toLowerCase()] ?? DEFAULT_TOOL_ICON;
}
