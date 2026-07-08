import type { JSX } from "react";
import {
  AccordionMarkdown,
  type InteractiveJsonSection,
} from "./AccordionMarkdown.js";
import { RenderedView, SourceView } from "./MarkdownViews.js";

const NO_LOOSE_STRING_VALUES = {
  rendered: "rendered",
  source: "source",
  accordion: "accordion",
} as const;

export type MarkdownMode = "rendered" | "source" | "accordion";

interface Props {
  content: string;
  mode?: MarkdownMode;
  className?: string;
  interactiveJsonSections?: readonly InteractiveJsonSection[];
  revealWords?: boolean;
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
  mode = NO_LOOSE_STRING_VALUES.rendered,
  className,
  interactiveJsonSections,
  revealWords = false,
}: Props): JSX.Element {
  if (mode === NO_LOOSE_STRING_VALUES.source) {
    return <SourceView content={content} className={className} />;
  }
  if (mode === NO_LOOSE_STRING_VALUES.accordion) {
    return (
      <AccordionMarkdown
        content={content}
        className={className}
        interactiveJsonSections={interactiveJsonSections}
      />
    );
  }
  return (
    <RenderedView
      content={content}
      className={className}
      revealWords={revealWords}
    />
  );
}
