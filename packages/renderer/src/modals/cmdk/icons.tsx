import {
  Code,
  FileText,
  Folder,
  Palette,
  Plus,
  Search,
  Settings,
  Square,
  Sun,
  Moon,
  Sunrise,
  Terminal,
  Zap,
} from "lucide-react";
import type { JSX } from "react";
import type { CmdkIcon } from "./sources.js";

/** Resolve a string icon-key to a Lucide React component. */
export function IconFor(props: { icon: CmdkIcon; size?: number }): JSX.Element {
  const size = props.size ?? 13;
  switch (props.icon) {
    case "Folder":
      return <Folder size={size} aria-hidden="true" />;
    case "FileText":
      return <FileText size={size} aria-hidden="true" />;
    case "Search":
      return <Search size={size} aria-hidden="true" />;
    case "Plus":
      return <Plus size={size} aria-hidden="true" />;
    case "Settings":
      return <Settings size={size} aria-hidden="true" />;
    case "Sun":
      return <Sun size={size} aria-hidden="true" />;
    case "Terminal":
      return <Terminal size={size} aria-hidden="true" />;
    case "Code":
      return <Code size={size} aria-hidden="true" />;
    case "Moon":
      return <Moon size={size} aria-hidden="true" />;
    case "Sunrise":
      return <Sunrise size={size} aria-hidden="true" />;
    case "Square":
      return <Square size={size} aria-hidden="true" />;
    case "Zap":
      return <Zap size={size} aria-hidden="true" />;
    case "Palette":
      return <Palette size={size} aria-hidden="true" />;
    default:
      return <Folder size={size} aria-hidden="true" />;
  }
}
