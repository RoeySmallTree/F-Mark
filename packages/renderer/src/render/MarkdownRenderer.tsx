import { useCallback, useLayoutEffect, useMemo, useRef, type JSX } from "react";
import { marked } from "marked";
import { AccordionMarkdown } from "./AccordionMarkdown.js";
import { useStore } from "../state/store.js";
import { linkifyPathsInElement } from "../prose/linkifyPaths.js";

export type MarkdownMode = "rendered" | "source" | "accordion";

interface Props {
  content: string;
  mode?: MarkdownMode;
  className?: string;
}

/**
 * Renders markdown in one of three modes:
 * - `rendered`: parsed to HTML and injected via `dangerouslySetInnerHTML`.
 *   Trusted local content; no DOMPurify pass.
 * - `source`: raw markdown inside `<pre><code>`.
 * - `accordion`: H1/H2 split into collapsible sections (see `AccordionMarkdown`).
 */
export function MarkdownRenderer({
  content,
  mode = "rendered",
  className,
}: Props): JSX.Element {
  if (mode === "source") {
    return <SourceView content={content} className={className} />;
  }
  if (mode === "accordion") {
    return <AccordionMarkdown content={content} className={className} />;
  }
  return <RenderedView content={content} className={className} />;
}

interface ViewProps {
  content: string;
  className?: string;
}

function RenderedView({ content, className }: ViewProps): JSX.Element {
  const html = useMemo(() => {
    try {
      return marked.parse(content ?? "", { async: false }) as string;
    } catch {
      return "";
    }
  }, [content]);

  const ref = useRef<HTMLDivElement | null>(null);
  const activePath = useStore((s) => s.activePath);
  const openFile = useStore((s) => s.openFile);
  const setRightTab = useStore((s) => s.setRightTab);

  /* After the HTML is injected, walk text nodes and wrap path-shaped
     strings in `<a class="path-link" data-fmark-path="…">` anchors.
     Click handling is delegated on the wrapper below so the walker
     doesn't have to manage individual listeners. */
  useLayoutEffect(() => {
    if (ref.current === null) return;
    linkifyPathsInElement(ref.current);
  }, [html]);

  const onClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!(e.target instanceof Element)) return;
      const link = e.target.closest<HTMLAnchorElement>(
        "a.path-link[data-fmark-path]",
      );
      if (link === null) return;
      const raw = link.getAttribute("data-fmark-path");
      if (raw === null) return;
      e.preventDefault();
      /* Resolve relative paths against the active project root. */
      const abs =
        raw.startsWith("/")
          ? raw
          : activePath !== null
            ? `${activePath}/${raw.replace(/^\.\//, "")}`
            : raw;
      setRightTab("files");
      openFile(abs);
    },
    [activePath, openFile, setRightTab],
  );

  // `md-doc` = the reference agent-components markdown layer (canonical look);
  // `fm-prose` = the app's richer base + extras (path links, h4-h6, del/mark).
  const cls = "md-doc fm-prose" + (className ? " " + className : "");
  return (
    <div
      ref={ref}
      className={cls}
      onClick={onClick}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function SourceView({ content, className }: ViewProps): JSX.Element {
  const cls = "fm-source" + (className ? " " + className : "");
  return (
    <pre className={cls}>
      <code>{content}</code>
    </pre>
  );
}
