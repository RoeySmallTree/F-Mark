import { useMemo, type JSX } from "react";
import { marked } from "marked";
import { AccordionMarkdown } from "./AccordionMarkdown.js";

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

  const cls = "fm-prose" + (className ? " " + className : "");
  return <div className={cls} dangerouslySetInnerHTML={{ __html: html }} />;
}

function SourceView({ content, className }: ViewProps): JSX.Element {
  const cls = "fm-source" + (className ? " " + className : "");
  return (
    <pre className={cls}>
      <code>{content}</code>
    </pre>
  );
}
