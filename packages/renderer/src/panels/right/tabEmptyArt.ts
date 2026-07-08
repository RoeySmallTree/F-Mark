/* Context-specific metadata for right-pane empty states.
   Each variant maps to an SVG icon glyph in TabEmptyIcon.tsx;
   the `art` string field has been retired in favour of those icons. */

export type TabEmptyVariant =
  | "diff-tree-clean"
  | "files-no-match"
  | "files-no-path"
  | "diff-no-path"
  | "diff-no-git"
  | "comments"
  | "terminal"
  | "terminal-agents"
  | "terminal-agents-live"
  | "agents"
  | "log"
  | "log-filtered"
  | "named";

export interface TabEmptyPreset {
  title: string;
  hint: string;
  /** When true the icon wrapper uses the deeper float animation and the
   *  folder glyph shows a blinking cursor — used for the no-project-path
   *  states that previously showed the animated Mario scene. */
  animated?: true;
}

export const TAB_EMPTY_PRESETS: Record<TabEmptyVariant, TabEmptyPreset> = {
  "diff-tree-clean": {
    title: "Nothing changed",
    hint: "No file diffs in this scope yet.",
  },
  "files-no-match": {
    title: "No matches",
    hint: "Try another search or clear the filter.",
  },
  "files-no-path": {
    title: "No project path",
    hint: "Pick a project path to browse its files.",
    animated: true,
  },
  "diff-no-path": {
    title: "No project path",
    hint: "Pick a project path to browse its diffs.",
    animated: true,
  },
  "diff-no-git": {
    title: "Not a git repo",
    hint: "This project path has no git repository.",
  },
  comments: {
    title: "No comments yet",
    hint: "Select text or use a comment marker to start one.",
  },
  terminal: {
    title: "No terminals open",
    hint: "Spawn a shell to run commands in this project.",
  },
  "terminal-agents": {
    title: "No agents in this session",
    hint: "Attach an agent to see its live terminal here.",
  },
  "terminal-agents-live": {
    title: "No live agent terminals",
    hint: "Agents are attached but none have an active shell.",
  },
  agents: {
    title: "No agents attached",
    hint: "Add an agent to this session to collaborate.",
  },
  log: {
    title: "No events yet",
    hint: "Session activity will show up here as it happens.",
  },
  "log-filtered": {
    title: "No matching events",
    hint: "Adjust or clear the filter to see more.",
  },
  named: {
    title: "No named contributions",
    hint: "Switch compose to Named and write your first piece.",
  },
};
