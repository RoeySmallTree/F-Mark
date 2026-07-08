export type LineRange = [number, number];

export interface LineBox {
  line: number;
  top: number;
  bottom: number;
  center: number;
}

export interface LineHit {
  line: number;
  box: LineBox;
}

export interface MarkerLayout<T> {
  item: T;
  visualCenter: number;
  box: LineBox;
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

export function lineKey(lines: LineRange): string {
  return `${lines[0]}:${lines[1]}`;
}

export function linesFromKey(key: string): LineRange | null {
  const parts = key.split(":");
  const a = Number(parts[0]);
  const b = Number(parts[1]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return [a, b];
}

export function lineLabel(lines: LineRange): string {
  return lines[0] === lines[1]
    ? `line ${lines[0]}`
    : `lines ${lines[0]}-${lines[1]}`;
}

export function rangeEquals(a: LineRange, b: LineRange): boolean {
  return a[0] === b[0] && a[1] === b[1];
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

export function rectsOf(range: Range): DOMRect[] {
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
      if (parent?.closest(".line-comment-highlight") !== null) {
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
  const measured: LineBox[] = [];
  const pushBox = (line: number, top: number, bottom: number): void => {
    if (bottom <= top) return;
    measured.push({ line, top, bottom, center: (top + bottom) / 2 });
  };
  for (const el of annotated) {
    const rawStart = Number(el.dataset.sourceLine);
    if (!Number.isFinite(rawStart)) continue;
    const rawEnd = Number(el.dataset.sourceLineEnd ?? rawStart);
    const start = clamp(Math.round(rawStart), 1, lineCount);
    const end = clamp(Math.round(rawEnd), start, lineCount);
    const rect = el.getBoundingClientRect();
    const span = end - start + 1;

    const rows = renderedRows(el);
    if (rows.length > 0) {
      const offset = rect.top - rootRect.top;
      rows.forEach((row, idx) => {
        const line = clamp(
          start + Math.floor((idx * span) / rows.length),
          start,
          end,
        );
        pushBox(line, row.top + offset, row.bottom + offset);
      });
      continue;
    }

    if (rect.height <= 0) continue;
    const top = rect.top - rootRect.top;
    const bottom = rect.bottom - rootRect.top;
    const step = span > 0 ? (bottom - top) / span : lineHeight;
    for (let line = start; line <= end; line++) {
      const lineTop = top + (line - start) * step;
      const lineBottom = line === end ? bottom : lineTop + step;
      pushBox(line, lineTop, lineBottom);
    }
  }
  if (measured.length === 0) return null;
  return measured.sort((a, b) => {
    if (Math.abs(a.top - b.top) > 0.5) return a.top - b.top;
    return a.line - b.line;
  });
}

export function measureLineBoxes(
  root: HTMLElement | null,
  lineCount: number,
  lineHeight: number,
): LineBox[] {
  if (root === null) return fallbackLineBoxes(lineCount, lineHeight);
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

export function lineHitFromY(
  y: number,
  boxes: LineBox[],
  lineCount: number,
  lineHeight: number,
): LineHit {
  if (boxes.length === 0) {
    const line = clamp(Math.floor(y / lineHeight) + 1, 1, lineCount);
    const top = (line - 1) * lineHeight;
    const bottom = top + lineHeight;
    return { line, box: { line, top, bottom, center: top + lineHeight / 2 } };
  }
  const containing = boxes.find((box) => y >= box.top && y <= box.bottom);
  if (containing !== undefined) {
    return { line: containing.line, box: containing };
  }
  const nearest = boxes.reduce((best, box) =>
    Math.abs(box.center - y) < Math.abs(best.center - y) ? box : best,
  );
  return { line: nearest.line, box: nearest };
}

export function lineFromY(
  y: number,
  boxes: LineBox[],
  lineCount: number,
  lineHeight: number,
): number {
  return lineHitFromY(y, boxes, lineCount, lineHeight).line;
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

function boxForMarker<T extends { lines: LineRange; boxOverride?: LineBox }>(
  item: T,
  lineBoxes: LineBox[],
  lineHeight: number,
): LineBox {
  return item.boxOverride ?? boxForRange(item.lines, lineBoxes, lineHeight);
}

export function lineHitEquals(a: LineHit | null, b: LineHit): boolean {
  return (
    a !== null &&
    a.line === b.line &&
    Math.abs(a.box.top - b.box.top) < 0.5 &&
    Math.abs(a.box.bottom - b.box.bottom) < 0.5
  );
}

export function layoutMarkers<T extends { lines: LineRange; boxOverride?: LineBox }>(
  items: T[],
  lineHeight: number,
  lineBoxes: LineBox[],
): MarkerLayout<T>[] {
  let nextCenter = Number.NEGATIVE_INFINITY;
  const minGap = 34;
  return [...items]
    .sort(
      (a, b) =>
        boxForMarker(a, lineBoxes, lineHeight).center -
        boxForMarker(b, lineBoxes, lineHeight).center,
    )
    .map((item) => {
      const box = boxForMarker(item, lineBoxes, lineHeight);
      const center = box.center;
      const visualCenter = Math.max(center, nextCenter);
      nextCenter = visualCenter + minGap;
      return { item, visualCenter, box };
    });
}
