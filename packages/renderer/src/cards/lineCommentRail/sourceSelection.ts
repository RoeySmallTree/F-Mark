import {
  lineFromY,
  rectsOf,
  type LineBox,
  type LineRange,
} from "./lineGeometry.js";

interface NormalizedText {
  text: string;
  map: number[];
}

function pushNormalizedChar(
  out: string[],
  map: number[],
  char: string,
  offset: number,
): void {
  if (/\s/.test(char)) {
    if (out.length > 0 && out[out.length - 1] !== " ") {
      out.push(" ");
      map.push(offset);
    }
    return;
  }
  if (char === "*" || char === "_" || char === "`" || char === "~") return;
  out.push(char.toLowerCase());
  map.push(offset);
}

function normalizeVisibleText(source: string): NormalizedText {
  const out: string[] = [];
  const map: number[] = [];
  let offset = 0;
  for (const rawLine of source.split(/\r?\n/)) {
    let line = rawLine;
    let lineOffset = offset;
    const leading = line.match(
      /^\s{0,3}(?:#{1,6}\s+|>\s*|(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?)/,
    );
    if (leading !== null) {
      lineOffset += leading[0].length;
      line = line.slice(leading[0].length);
    }
    for (let i = 0; i < line.length; i++) {
      const char = line[i]!;
      const absoluteOffset = lineOffset + i;
      if (char === "[" || char === "]") continue;
      if (char === "(" && i > 0 && line[i - 1] === "]") {
        const close = line.indexOf(")", i + 1);
        if (close >= 0) {
          i = close;
          continue;
        }
      }
      pushNormalizedChar(out, map, char, absoluteOffset);
    }
    pushNormalizedChar(out, map, " ", lineOffset + line.length);
    offset += rawLine.length + 1;
  }
  while (out[0] === " ") {
    out.shift();
    map.shift();
  }
  while (out[out.length - 1] === " ") {
    out.pop();
    map.pop();
  }
  return { text: out.join(""), map };
}

function lineStarts(content: string): number[] {
  const starts = [0];
  for (let i = 0; i < content.length; i++) {
    if (content[i] === "\n") starts.push(i + 1);
  }
  return starts;
}

function lineForOffset(starts: number[], offset: number): number {
  let line = 1;
  for (let i = 0; i < starts.length; i++) {
    if (starts[i]! <= offset) line = i + 1;
    else break;
  }
  return line;
}

function scoreRange(candidate: LineRange, approximate: LineRange): number {
  return (
    Math.abs(candidate[0] - approximate[0]) +
    Math.abs(candidate[1] - approximate[1])
  );
}

export function lineRangeForSelectedText(
  content: string,
  selectedText: string,
  approximate?: LineRange | null,
): LineRange | null {
  const normalizedNeedle = normalizeVisibleText(selectedText).text;
  if (normalizedNeedle.length === 0) return null;
  const normalizedSource = normalizeVisibleText(content);
  if (normalizedSource.text.length === 0) return null;

  const starts = lineStarts(content);
  const candidates: LineRange[] = [];
  let searchFrom = 0;
  for (;;) {
    const idx = normalizedSource.text.indexOf(normalizedNeedle, searchFrom);
    if (idx < 0) break;
    const startOffset = normalizedSource.map[idx];
    if (startOffset !== undefined) {
      const endOffset =
        normalizedSource.map[idx + normalizedNeedle.length - 1] ?? startOffset;
      candidates.push([
        lineForOffset(starts, startOffset),
        lineForOffset(starts, endOffset),
      ]);
    }
    searchFrom = idx + Math.max(1, normalizedNeedle.length);
  }

  if (candidates.length === 0) return null;
  if (approximate === undefined || approximate === null) return candidates[0]!;
  return candidates.reduce((best, candidate) =>
    scoreRange(candidate, approximate) < scoreRange(best, approximate)
      ? candidate
      : best,
  );
}

export function selectionLinesFromRange(
  range: Range,
  root: HTMLElement,
  boxes: LineBox[],
  lineCount: number,
  lineHeight: number,
  sourceText: string,
): LineRange | null {
  const rootRect = root.getBoundingClientRect();
  const lines = new Set<number>();
  for (const rect of rectsOf(range)) {
    const top = Math.max(0, rect.top - rootRect.top);
    const bottom = Math.max(top, rect.bottom - rootRect.top);
    lines.add(lineFromY((top + bottom) / 2, boxes, lineCount, lineHeight));
  }
  if (lines.size === 0) {
    return lineRangeForSelectedText(sourceText, range.toString(), null);
  }
  const ordered = [...lines].sort((a, b) => a - b);
  const approximate: LineRange = [ordered[0]!, ordered[ordered.length - 1]!];
  return (
    lineRangeForSelectedText(sourceText, range.toString(), approximate) ??
    approximate
  );
}
