import type {
  AccessRequestPayload,
  AccessRequestSuggestion,
} from "@f-mark/shared";
import { chordToLabel } from "../modals/settings/shortcut-registry.js";

const NO_LOOSE_STRING_VALUES = {
  named: "named",
  fmarkPath: "fmark-path",
  files: "files",
  file: "file",
  approve: "approve",
  deny: "deny",
  files2: "Files",
} as const;

export type ComposeMode = "message" | "named";
export type ComposeDragMode = "files" | "fmark-path";

const NAMED_SHORTCUT = chordToLabel("$mod+N");
export const PRESETS_SHORTCUT = chordToLabel("$mod+P");
export const SKILLS_SHORTCUT = chordToLabel("$mod+Shift+K");

function placeholderFor(mode: ComposeMode): string {
  if (mode === NO_LOOSE_STRING_VALUES.named) return "Write the contribution content\u2026";
  return `Write a message or ${NAMED_SHORTCUT} to name a contribution\u2026`;
}

export function composePlaceholder(
  mode: ComposeMode,
  draggingMode: ComposeDragMode | null,
): string {
  if (draggingMode === NO_LOOSE_STRING_VALUES.fmarkPath) return "Drop to paste path";
  if (draggingMode === NO_LOOSE_STRING_VALUES.files) return "Drop to attach";
  return placeholderFor(mode);
}

export function filesFromClipboard(data: DataTransfer): File[] {
  const directFiles = Array.from(data.files ?? []);
  if (directFiles.length > 0) return directFiles;
  return Array.from(data.items ?? [])
    .filter((item) => item.kind === NO_LOOSE_STRING_VALUES.file)
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null);
}

export function accessRequestSuggestions(
  request: AccessRequestPayload,
): AccessRequestSuggestion[] {
  return (request.suggestions ?? []).filter(
    (suggestion): suggestion is AccessRequestSuggestion =>
      suggestion !== null &&
      typeof suggestion === "object" &&
      typeof suggestion.id === "string" &&
      typeof suggestion.label === "string" &&
      (suggestion.decision === NO_LOOSE_STRING_VALUES.approve || suggestion.decision === NO_LOOSE_STRING_VALUES.deny),
  );
}

export function detectComposeDragMode(
  dataTransfer: DataTransfer,
): ComposeDragMode | null {
  const types = Array.from(dataTransfer.types);
  if (types.includes("application/x-fmark-file-path")) return NO_LOOSE_STRING_VALUES.fmarkPath;
  if (types.includes(NO_LOOSE_STRING_VALUES.files2)) return NO_LOOSE_STRING_VALUES.files;
  return null;
}

export function appendToken(content: string, token: string): string {
  const needsSpace = content.length > 0 && !/\s$/.test(content);
  return `${content}${needsSpace ? " " : ""}${token} `;
}

export function appendDroppedPath(content: string, path: string): string {
  if (content.length === 0) return path;
  if (/\s$/.test(content)) return `${content}${path}`;
  return `${content} ${path}`;
}

export function cssEscape(s: string): string {
  const esc = (globalThis as { CSS?: { escape?: (v: string) => string } }).CSS
    ?.escape;
  return typeof esc === "function" ? esc(s) : s.replace(/"/g, '\\"');
}
