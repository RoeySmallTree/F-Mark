import { lineLabel, type LineRange } from "./lineGeometry.js";

function snippetForLines(
  content: string,
  lines: LineRange,
  max = 120,
): string {
  const text = content
    .split(/\r?\n/)
    .slice(lines[0] - 1, lines[1])
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function snippetForText(text: string | null, max = 120): string | null {
  if (text === null) return null;
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length === 0) return null;
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 1)}…`;
}

export function commentTargetPreview(
  content: string,
  lines: LineRange,
  selectedText: string | null,
): string {
  const fallback = snippetForLines(content, lines) || lineLabel(lines);
  return snippetForText(selectedText) ?? fallback;
}
