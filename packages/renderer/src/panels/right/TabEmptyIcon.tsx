import type { JSX, ReactNode } from "react";
import type { TabEmptyVariant } from "./tabEmptyArt.js";

/* ── Double-bezel shell ────────────────────────────────────────────────────
   Outer ring: subtle agent-tinted border + very light field.
   Inner core: slightly denser tint + inset highlight, like machined glass. */
function Wrap({
  children,
  animated = false,
}: {
  children: ReactNode;
  animated?: boolean;
}): JSX.Element {
  return (
    <div
      className={[
        "tab-empty-icon-outer",
        animated ? "tab-empty-icon-animated" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-hidden="true"
    >
      <div className="tab-empty-icon-inner">{children}</div>
    </div>
  );
}

/* ── Clean / verified ──────────────────────────────────────────────────────
   A rounded square with a single confident checkmark. */
function CleanIcon(): JSX.Element {
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect
        x="5"
        y="5"
        width="30"
        height="30"
        rx="7"
        stroke="currentColor"
        strokeWidth="1.5"
        className="tab-icon-bg"
      />
      <path
        d="M13 20.5L18 25.5L27 15"
        stroke="currentColor"
        strokeWidth="1.75"
      />
    </svg>
  );
}

/* ── Search / no results ───────────────────────────────────────────────────
   A magnifier lens with an X inside — no matches found. */
function SearchEmptyIcon(): JSX.Element {
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle
        cx="17"
        cy="17"
        r="10"
        stroke="currentColor"
        strokeWidth="1.5"
        className="tab-icon-bg"
      />
      <line
        x1="24.5"
        y1="24.5"
        x2="34"
        y2="34"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      {/* X inside lens */}
      <line
        x1="14"
        y1="14"
        x2="20"
        y2="20"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <line
        x1="20"
        y1="14"
        x2="14"
        y2="20"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}

/* ── Folder (no project path) ──────────────────────────────────────────────
   A folder with dashed interior lines suggesting emptiness.
   When animated=true the cursor blink element is rendered. */
function FolderIcon({ showCursor }: { showCursor?: boolean }): JSX.Element {
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* body */}
      <path
        d="M4 18C4 16.3 5.3 15 7 15H33C34.7 15 36 16.3 36 18V33C36 34.7 34.7 36 33 36H7C5.3 36 4 34.7 4 33V18Z"
        stroke="currentColor"
        strokeWidth="1.5"
        className="tab-icon-bg"
      />
      {/* tab */}
      <path
        d="M4 15V13C4 11.3 5.3 10 7 10H16L18.5 7.5H33C34.7 7.5 36 8.8 36 10.5V15"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      {/* dashed content hint lines */}
      <line
        x1="11"
        y1="23"
        x2="29"
        y2="23"
        stroke="currentColor"
        strokeWidth="1"
        strokeDasharray="2.5 3"
        strokeLinecap="round"
        opacity="0.4"
      />
      <line
        x1="11"
        y1="29"
        x2="22"
        y2="29"
        stroke="currentColor"
        strokeWidth="1"
        strokeDasharray="2.5 3"
        strokeLinecap="round"
        opacity="0.28"
      />
      {/* blinking cursor — only for animated variant */}
      {showCursor === true && (
        <rect
          x="25"
          y="20.5"
          width="6"
          height="1.75"
          rx="0.875"
          fill="currentColor"
          className="tab-icon-cursor"
        />
      )}
    </svg>
  );
}

/* ── No git repo ───────────────────────────────────────────────────────────
   A three-node git graph with an X overlaid at the bottom-right. */
function NoGitIcon(): JSX.Element {
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* three commit nodes */}
      <circle
        cx="13"
        cy="8"
        r="3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        className="tab-icon-bg"
      />
      <circle
        cx="13"
        cy="28"
        r="3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        className="tab-icon-bg"
      />
      <circle
        cx="27"
        cy="16"
        r="3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        className="tab-icon-bg"
      />
      {/* trunk */}
      <line
        x1="13"
        y1="11.5"
        x2="13"
        y2="24.5"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      {/* branch curve */}
      <path
        d="M13 13C13 19 27 15 27 19"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      {/* X — "not a git repo" */}
      <line
        x1="26"
        y1="28"
        x2="35"
        y2="37"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <line
        x1="35"
        y1="28"
        x2="26"
        y2="37"
        stroke="currentColor"
        strokeWidth="1.75"
      />
    </svg>
  );
}

/* ── Comments / threads ────────────────────────────────────────────────────
   A speech bubble with three dots inside — waiting for a first comment. */
function CommentsIcon(): JSX.Element {
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path
        d="M5 7C5 5.3 6.3 4 8 4H32C33.7 4 35 5.3 35 7V22C35 23.7 33.7 25 32 25H20.5L18 30L15.5 25H8C6.3 25 5 23.7 5 22V7Z"
        stroke="currentColor"
        strokeWidth="1.5"
        className="tab-icon-bg"
      />
      {/* ellipsis */}
      <circle cx="13" cy="14.5" r="1.8" fill="currentColor" />
      <circle cx="20" cy="14.5" r="1.8" fill="currentColor" />
      <circle cx="27" cy="14.5" r="1.8" fill="currentColor" />
    </svg>
  );
}

/* ── Terminal ──────────────────────────────────────────────────────────────
   A macOS-style terminal window with a chevron prompt and blinking cursor. */
function TerminalIcon(): JSX.Element {
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect
        x="3"
        y="5"
        width="34"
        height="30"
        rx="5"
        stroke="currentColor"
        strokeWidth="1.5"
        className="tab-icon-bg"
      />
      {/* traffic-light dots */}
      <circle cx="9.5" cy="12" r="1.8" fill="currentColor" opacity="0.35" />
      <circle cx="15.5" cy="12" r="1.8" fill="currentColor" opacity="0.22" />
      <circle cx="21.5" cy="12" r="1.8" fill="currentColor" opacity="0.13" />
      {/* divider bar */}
      <line
        x1="3"
        y1="17"
        x2="37"
        y2="17"
        stroke="currentColor"
        strokeWidth="1"
        opacity="0.18"
      />
      {/* › chevron prompt */}
      <path
        d="M9 25.5L14 28.5L9 31.5"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      {/* cursor (blinks) */}
      <line
        x1="17"
        y1="28.5"
        x2="28"
        y2="28.5"
        stroke="currentColor"
        strokeWidth="1.75"
        className="tab-icon-cursor"
      />
    </svg>
  );
}

/* ── Agent face ────────────────────────────────────────────────────────────
   A minimal robot head — two circular eyes, an arc smile, and an antenna.
   When `live` is true a small pulsing activity dot appears top-right. */
function AgentIcon({ live = false }: { live?: boolean }): JSX.Element {
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* head */}
      <rect
        x="7"
        y="10"
        width="26"
        height="20"
        rx="6"
        stroke="currentColor"
        strokeWidth="1.5"
        className="tab-icon-bg"
      />
      {/* eyes */}
      <circle cx="16" cy="18.5" r="2.5" fill="currentColor" />
      <circle cx="24" cy="18.5" r="2.5" fill="currentColor" />
      {/* smile */}
      <path
        d="M14 24.5C14 27.5 26 27.5 26 24.5"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      {/* antenna */}
      <line
        x1="20"
        y1="10"
        x2="20"
        y2="5.5"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <circle cx="20" cy="4.5" r="1.8" fill="currentColor" />
      {/* live activity dot */}
      {live && (
        <circle
          cx="32"
          cy="9"
          r="3.5"
          fill="currentColor"
          className="tab-icon-pulse"
        />
      )}
    </svg>
  );
}

/* ── Log timeline ──────────────────────────────────────────────────────────
   Three nodes on a vertical track. The bottom node is dashed to hint
   at "nothing here yet". Short labels reinforce the timeline metaphor. */
function LogIcon(): JSX.Element {
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* track */}
      <line
        x1="20"
        y1="6"
        x2="20"
        y2="34"
        stroke="currentColor"
        strokeWidth="1"
        opacity="0.22"
      />
      {/* nodes */}
      <circle
        cx="20"
        cy="9"
        r="3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        className="tab-icon-bg"
      />
      <circle
        cx="20"
        cy="20"
        r="3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        className="tab-icon-bg"
      />
      {/* bottom node: empty/dashed = no events */}
      <circle
        cx="20"
        cy="31"
        r="3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeDasharray="2.5 2"
      />
      {/* entry label lines (right side) */}
      <line
        x1="25.5"
        y1="9"
        x2="34"
        y2="9"
        stroke="currentColor"
        strokeWidth="1"
        opacity="0.38"
      />
      <line
        x1="25.5"
        y1="20"
        x2="31"
        y2="20"
        stroke="currentColor"
        strokeWidth="1"
        opacity="0.28"
      />
    </svg>
  );
}

/* ── Named / document ──────────────────────────────────────────────────────
   A dog-eared document with three text lines. */
function NamedIcon(): JSX.Element {
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* doc body */}
      <path
        d="M8 3H26L35 12V36C35 37.1 34.1 38 33 38H8C6.9 38 6 37.1 6 36V5C6 3.9 6.9 3 8 3Z"
        stroke="currentColor"
        strokeWidth="1.5"
        className="tab-icon-bg"
      />
      {/* folded corner */}
      <path d="M26 3V12H35" stroke="currentColor" strokeWidth="1.5" />
      {/* text lines */}
      <line
        x1="11"
        y1="19"
        x2="29"
        y2="19"
        stroke="currentColor"
        strokeWidth="1.5"
        opacity="0.55"
      />
      <line
        x1="11"
        y1="24.5"
        x2="29"
        y2="24.5"
        stroke="currentColor"
        strokeWidth="1.5"
        opacity="0.55"
      />
      <line
        x1="11"
        y1="30"
        x2="21"
        y2="30"
        stroke="currentColor"
        strokeWidth="1.5"
        opacity="0.32"
      />
    </svg>
  );
}

/* ── Main export ───────────────────────────────────────────────────────────
   Dispatches to the right glyph and wraps it in the double-bezel shell. */
export function TabEmptyIcon({
  variant,
  animated = false,
}: {
  variant: TabEmptyVariant;
  animated?: boolean;
}): JSX.Element {
  let icon: JSX.Element;

  switch (variant) {
    case "diff-tree-clean":
      icon = <CleanIcon />;
      break;
    case "files-no-match":
    case "log-filtered":
      icon = <SearchEmptyIcon />;
      break;
    case "files-no-path":
    case "diff-no-path":
      icon = <FolderIcon showCursor />;
      break;
    case "diff-no-git":
      icon = <NoGitIcon />;
      break;
    case "comments":
      icon = <CommentsIcon />;
      break;
    case "terminal":
      icon = <TerminalIcon />;
      break;
    case "terminal-agents":
    case "agents":
      icon = <AgentIcon />;
      break;
    case "terminal-agents-live":
      icon = <AgentIcon live />;
      break;
    case "log":
      icon = <LogIcon />;
      break;
    case "named":
      icon = <NamedIcon />;
      break;
    default:
      icon = <CleanIcon />;
  }

  return <Wrap animated={animated}>{icon}</Wrap>;
}
