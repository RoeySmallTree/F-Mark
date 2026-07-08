import { useCallback, useLayoutEffect, useMemo, useRef, type JSX } from "react";
import { marked } from "marked";
import { usePresentFile } from "../shell/usePresentFile.js";
import { linkifyPathsInElement } from "../prose/linkifyPaths.js";
import { revealWordsInElement } from "./wordReveal.js";

export interface MarkdownViewProps {
  content: string;
  className?: string;
  revealWords?: boolean;
}

interface SourceLineRange {
  start: number;
  end: number;
}

type SourceBlockKind =
  | "blockquote"
  | "code"
  | "heading"
  | "list"
  | "paragraph"
  | "rule";

const sourceBlockKinds = {
  blockquote: "blockquote",
  code: "code",
  heading: "heading",
  list: "list",
  paragraph: "paragraph",
  rule: "rule",
} as const satisfies Record<string, SourceBlockKind>;

const markdownFenceMarkers = {
  tilde: "~~~",
  backtick: "```",
} as const;

const markdownSelectors = {
  pathLink: "a.path-link[data-fmark-path]",
  fmarkPath: "data-fmark-path",
} as const;

const markdownClassNames = {
  rendered: "md-doc fm-prose",
  source: "fm-source",
  joiner: " ",
  empty: "",
} as const;

function classifySourceLine(line: string): SourceBlockKind {
  const trimmed = line.trim();
  if (/^#{1,6}\s+/.test(trimmed)) return sourceBlockKinds.heading;
  if (/^([-*_]\s*){3,}$/.test(trimmed)) return sourceBlockKinds.rule;
  if (/^(```|~~~)/.test(trimmed)) return sourceBlockKinds.code;
  if (/^>/.test(trimmed)) return sourceBlockKinds.blockquote;
  if (/^\s{0,3}(?:[-*+]\s+|\d+[.)]\s+)/.test(line)) {
    return sourceBlockKinds.list;
  }
  return sourceBlockKinds.paragraph;
}

function sourceLineRanges(content: string): SourceLineRange[] {
  const lines = content.split(/\r?\n/);
  const ranges: SourceLineRange[] = [];
  let current: { start: number; kind: SourceBlockKind } | null = null;
  let inFence = false;
  let fenceMarker: string | null = null;

  const flush = (end: number): void => {
    if (current === null) return;
    ranges.push({ start: current.start, end: Math.max(current.start, end) });
    current = null;
  };

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx]!;
    const lineNo = idx + 1;
    const trimmed = line.trim();

    if (inFence) {
      if (fenceMarker !== null && trimmed.startsWith(fenceMarker)) {
        flush(lineNo);
        inFence = false;
        fenceMarker = null;
      }
      continue;
    }

    if (trimmed.length === 0) {
      flush(lineNo - 1);
      continue;
    }

    const kind = classifySourceLine(line);
    if (kind === sourceBlockKinds.heading || kind === sourceBlockKinds.rule) {
      flush(lineNo - 1);
      ranges.push({ start: lineNo, end: lineNo });
      continue;
    }

    if (kind === sourceBlockKinds.code) {
      flush(lineNo - 1);
      current = { start: lineNo, kind };
      inFence = true;
      fenceMarker = trimmed.startsWith(markdownFenceMarkers.tilde)
        ? markdownFenceMarkers.tilde
        : markdownFenceMarkers.backtick;
      continue;
    }

    if (current === null) {
      current = { start: lineNo, kind };
      continue;
    }
    if (current.kind !== kind) {
      flush(lineNo - 1);
      current = { start: lineNo, kind };
    }
  }

  flush(lines.length);
  return ranges;
}

function annotateSourceLines(root: HTMLElement, content: string): void {
  const ranges = sourceLineRanges(content);
  const children = Array.from(root.children).filter(
    (child): child is HTMLElement => child instanceof HTMLElement,
  );
  children.forEach((child, idx) => {
    const range = ranges[idx];
    if (range === undefined) return;
    child.dataset.sourceLine = String(range.start);
    child.dataset.sourceLineEnd = String(range.end);
  });
}

export function RenderedView({
  content,
  className,
  revealWords = false,
}: MarkdownViewProps): JSX.Element {
  const html = useMemo(() => {
    try {
      return marked.parse(content ?? "", { async: false }) as string;
    } catch {
      return "";
    }
  }, [content]);

  const ref = useRef<HTMLDivElement | null>(null);
  /* Tracks the reveal already played so a re-render resumes correctly. A
     streamed message re-renders on every delta, and the app mounts under
     StrictMode (which replays layout effects): identical content replays the
     same boundary, appended content animates only the new tail, anything else
     restarts from scratch. */
  const revealRef = useRef<{
    content: string;
    startIndex: number;
    total: number;
  }>({ content: "", startIndex: 0, total: 0 });
  const presentFile = usePresentFile();

  /* After the HTML is injected, walk text nodes and wrap path-shaped
     strings in `<a class="path-link" data-fmark-path="...">` anchors.
     Click handling is delegated on the wrapper below so the walker
     doesn't have to manage individual listeners. */
  useLayoutEffect(() => {
    if (ref.current === null) return;
    annotateSourceLines(ref.current, content);
    linkifyPathsInElement(ref.current);
    if (!revealWords) {
      revealRef.current = { content, startIndex: 0, total: 0 };
      return;
    }
    const prev = revealRef.current;
    const startIndex =
      content === prev.content
        ? prev.startIndex
        : content.startsWith(prev.content)
          ? prev.total
          : 0;
    const reveal = revealWordsInElement(ref.current, startIndex);
    revealRef.current = { content, startIndex, total: reveal.total };
    return () => reveal.cancel();
  }, [html, content, revealWords]);

  const onClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!(e.target instanceof Element)) return;
      const link = e.target.closest<HTMLAnchorElement>(
        markdownSelectors.pathLink,
      );
      if (link === null) return;
      const raw = link.getAttribute(markdownSelectors.fmarkPath);
      if (raw === null) return;
      e.preventDefault();
      presentFile(raw);
    },
    [presentFile],
  );

  const cls =
    markdownClassNames.rendered +
    (className ? markdownClassNames.joiner + className : markdownClassNames.empty);
  return (
    <div
      ref={ref}
      className={cls}
      onClick={onClick}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export function SourceView({
  content,
  className,
}: MarkdownViewProps): JSX.Element {
  const cls =
    markdownClassNames.source +
    (className ? markdownClassNames.joiner + className : markdownClassNames.empty);
  return (
    <pre className={cls}>
      <code>{content}</code>
    </pre>
  );
}
