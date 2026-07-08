const NO_LOOSE_STRING_VALUES = {
  dataSourceLine: "data-source-line",
  dataSourceLineEnd: "data-source-line-end",
} as const;

/* Generalized rendered-line measurement.

   Extracted from the chat-document LineCommentRail so the file viewer's
   non-code overlay (markdown / csv) can map a pointer Y / a text selection to a
   1-based source line over arbitrary rendered DOM, using the same row-walking
   heuristic. Pure + DOM-only; no React. */

export type LineRange = [number, number];

export interface LineBox {
  line: number;
  top: number;
  bottom: number;
  center: number;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function normalizeLines(
  lines: LineRange | undefined,
  maxLine: number,
): LineRange {
  const start = clamp(lines?.[0] ?? 1, 1, maxLine);
  const end = clamp(lines?.[1] ?? start, start, maxLine);
  return [start, end];
}

export function sameLineBoxes(a: LineBox[], b: LineBox[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((box, idx) => {
    const other = b[idx];
    return (
      other !== undefined &&
      box.line === other.line &&
      Math.abs(box.top - other.top) < 0.5 &&
      Math.abs(box.bottom - other.bottom) < 0.5
    );
  });
}

export function fallbackLineBoxes(
  lineCount: number,
  lineHeight: number,
): LineBox[] {
  return Array.from({ length: lineCount }, (_, idx) => {
    const line = idx + 1;
    const top = idx * lineHeight;
    const bottom = top + lineHeight;
    return { line, top, bottom, center: top + lineHeight / 2 };
  });
}

function rectsOf(range: Range): DOMRect[] {
  if (typeof range.getClientRects !== "function") return [];
  return Array.from(range.getClientRects()).filter(
    (rect) => rect.width > 0 && rect.height > 0,
  );
}

function overlaps(
  a: { top: number; bottom: number },
  b: { top: number; bottom: number },
): boolean {
  return Math.max(a.top, b.top) <= Math.min(a.bottom, b.bottom);
}

function renderedRows(root: HTMLElement): { top: number; bottom: number }[] {
  const rootRect = root.getBoundingClientRect();
  const rows: { top: number; bottom: number }[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (parent?.closest(".fv-line-comment-highlight") !== null) {
        return NodeFilter.FILTER_REJECT;
      }
      return node.textContent?.trim()
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT;
    },
  });

  let node = walker.nextNode();
  while (node !== null) {
    const range = document.createRange();
    range.selectNodeContents(node);
    for (const rect of rectsOf(range)) {
      const top = rect.top - rootRect.top;
      const bottom = rect.bottom - rootRect.top;
      const existing = rows.find(
        (row) => Math.abs(row.top - top) < 2 || overlaps(row, { top, bottom }),
      );
      if (existing === undefined) {
        rows.push({ top, bottom });
      } else {
        existing.top = Math.min(existing.top, top);
        existing.bottom = Math.max(existing.bottom, bottom);
      }
    }
    range.detach?.();
    node = walker.nextNode();
  }
  return rows.sort((a, b) => a.top - b.top);
}

/* True when the rendered subtree exposes REAL source-line metadata via
   `[data-source-line]` (CSV rows and markdown blocks do). When present, line
   anchoring is exact and trustworthy; when absent, callers should treat the
   mapping as best-effort (see RenderedLineCommentRail). */
function hasSourceLineMetadata(root: HTMLElement | null): boolean {
  if (root === null) return false;
  return root.querySelector("[data-source-line]") !== null;
}

/* Measure line boxes from explicit `[data-source-line]` attributes — exact,
   no proportional guessing. Each annotated element's rect is attributed to its
   declared 1-based source line. Returns null when no such elements exist (the
   caller falls back to the row-walking heuristic). */
function measureLineBoxesFromAttributes(
  root: HTMLElement,
  lineCount: number,
  lineHeight: number,
): LineBox[] | null {
  const annotated = Array.from(
    root.querySelectorAll<HTMLElement>("[data-source-line]"),
  );
  if (annotated.length === 0) return null;
  const rootRect = root.getBoundingClientRect();
  const byLine = new Map<number, { top: number; bottom: number }>();
  for (const el of annotated) {
    const rawStart = Number(el.getAttribute(NO_LOOSE_STRING_VALUES.dataSourceLine));
    if (!Number.isFinite(rawStart)) continue;
    const rawEnd = Number(el.getAttribute(NO_LOOSE_STRING_VALUES.dataSourceLineEnd) ?? rawStart);
    const start = clamp(Math.round(rawStart), 1, lineCount);
    const end = clamp(Math.round(rawEnd), start, lineCount);
    const rect = el.getBoundingClientRect();
    if (rect.height <= 0) continue;
    const top = rect.top - rootRect.top;
    const bottom = rect.bottom - rootRect.top;
    const span = end - start + 1;
    const step = span > 0 ? (bottom - top) / span : lineHeight;
    for (let line = start; line <= end; line++) {
      const lineTop = top + (line - start) * step;
      const lineBottom = line === end ? bottom : lineTop + step;
      const existing = byLine.get(line);
      if (existing === undefined) {
        byLine.set(line, { top: lineTop, bottom: lineBottom });
      } else {
        existing.top = Math.min(existing.top, lineTop);
        existing.bottom = Math.max(existing.bottom, lineBottom);
      }
    }
  }
  if (byLine.size === 0) return null;
  return fallbackLineBoxes(lineCount, lineHeight).map((box) => {
    const measured = byLine.get(box.line);
    if (measured === undefined) return box;
    return {
      line: box.line,
      top: measured.top,
      bottom: measured.bottom,
      center: (measured.top + measured.bottom) / 2,
    };
  });
}

export function measureLineBoxes(
  root: HTMLElement | null,
  lineCount: number,
  lineHeight: number,
): LineBox[] {
  if (root === null) return fallbackLineBoxes(lineCount, lineHeight);
  /* Prefer exact `[data-source-line]` metadata (CSV) over the proportional
     row-walking heuristic. */
  const fromAttrs = measureLineBoxesFromAttributes(root, lineCount, lineHeight);
  if (fromAttrs !== null) return fromAttrs;
  const rows = renderedRows(root);
  if (rows.length === 0) return fallbackLineBoxes(lineCount, lineHeight);

  const byLine = new Map<number, { top: number; bottom: number }>();
  rows.forEach((row, idx) => {
    const line = clamp(
      Math.floor((idx * lineCount) / rows.length) + 1,
      1,
      lineCount,
    );
    const existing = byLine.get(line);
    if (existing === undefined) {
      byLine.set(line, { top: row.top, bottom: row.bottom });
    } else {
      existing.top = Math.min(existing.top, row.top);
      existing.bottom = Math.max(existing.bottom, row.bottom);
    }
  });

  return fallbackLineBoxes(lineCount, lineHeight).map((box) => {
    const measured = byLine.get(box.line);
    if (measured === undefined) return box;
    return {
      line: box.line,
      top: measured.top,
      bottom: measured.bottom,
      center: (measured.top + measured.bottom) / 2,
    };
  });
}

export function boxForRange(
  lines: LineRange,
  boxes: LineBox[],
  lineHeight: number,
): LineBox {
  const selected = boxes.filter(
    (box) => box.line >= lines[0] && box.line <= lines[1],
  );
  if (selected.length === 0) {
    const top = (lines[0] - 1) * lineHeight;
    const bottom = lines[1] * lineHeight;
    return { line: lines[0], top, bottom, center: (top + bottom) / 2 };
  }
  const top = Math.min(...selected.map((box) => box.top));
  const bottom = Math.max(...selected.map((box) => box.bottom));
  return { line: lines[0], top, bottom, center: (top + bottom) / 2 };
}

export function lineFromY(
  y: number,
  boxes: LineBox[],
  lineCount: number,
  lineHeight: number,
): number {
  if (boxes.length === 0) {
    return clamp(Math.floor(y / lineHeight) + 1, 1, lineCount);
  }
  const containing = boxes.find((box) => y >= box.top && y <= box.bottom);
  if (containing !== undefined) return containing.line;
  const nearest = boxes.reduce((best, box) =>
    Math.abs(box.center - y) < Math.abs(best.center - y) ? box : best,
  );
  return nearest.line;
}

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

function lineRangeForSelectedText(
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
  if (typeof range.getClientRects !== "function") return null;
  for (const rect of Array.from(range.getClientRects()).filter(
    (r) => r.width > 0 && r.height > 0,
  )) {
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
