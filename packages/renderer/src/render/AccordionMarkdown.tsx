import { useMemo, useState, type JSX } from "react";
import { ChevronRight } from "lucide-react";
import { MarkdownRenderer } from "./MarkdownRenderer.js";

interface SubSection {
  title: string;
  body: string;
}

interface Section {
  title: string;
  body: string;
  subsections: SubSection[];
}

interface ParsedMarkdown {
  preamble: string;
  sections: Section[];
}

/**
 * Split markdown into a preamble, top-level `#` sections, and `##` subsections.
 * Headings inside fenced code blocks (```) are ignored. Adapted from CABAL's
 * `AccordionMarkdown.tsx` — same parser logic, no UI coupling.
 */
export function parseMarkdownSections(content: string): ParsedMarkdown {
  const lines = content.split("\n");
  const sections: Section[] = [];
  let preamble = "";
  let currentSection: Section | null = null;
  let currentSubSection: SubSection | null = null;
  let buffer: string[] = [];
  let inCodeFence = false;

  const flushSubSection = (): void => {
    if (currentSubSection && currentSection) {
      currentSubSection.body = buffer.join("\n").trim();
      currentSection.subsections.push(currentSubSection);
      currentSubSection = null;
      buffer = [];
    }
  };

  const flushSection = (): void => {
    if (currentSection) {
      if (currentSubSection) {
        flushSubSection();
      } else {
        currentSection.body = buffer.join("\n").trim();
        buffer = [];
      }
      sections.push(currentSection);
      currentSection = null;
    }
  };

  for (const line of lines) {
    if (line.trimStart().startsWith("```")) {
      inCodeFence = !inCodeFence;
      buffer.push(line);
      continue;
    }
    if (inCodeFence) {
      buffer.push(line);
      continue;
    }

    const h1Match = line.match(/^# (.+)/);
    const h2Match = line.match(/^## (.+)/);

    if (h1Match) {
      if (!currentSection && buffer.length > 0) {
        preamble = buffer.join("\n").trim();
        buffer = [];
      }
      flushSection();
      currentSection = {
        title: h1Match[1]!.trim(),
        body: "",
        subsections: [],
      };
    } else if (h2Match && currentSection) {
      if (currentSubSection) {
        flushSubSection();
      } else {
        currentSection.body = buffer.join("\n").trim();
        buffer = [];
      }
      currentSubSection = { title: h2Match[1]!.trim(), body: "" };
    } else {
      buffer.push(line);
    }
  }

  if (currentSection) {
    if (currentSubSection) {
      flushSubSection();
    } else {
      currentSection.body = buffer.join("\n").trim();
    }
    sections.push(currentSection);
  } else if (buffer.length > 0) {
    preamble = buffer.join("\n").trim();
  }

  return { preamble, sections };
}

interface Props {
  content: string;
  className?: string;
}

/**
 * Collapsible markdown. Splits on `#` and `##` outside code fences; every
 * section is collapsed by default; clicking a header reveals the body (and any
 * subsections). Themed via our `fm-accordion*` classes, which resolve to CSS
 * variables defined in `render.css`.
 */
export function AccordionMarkdown({ content, className }: Props): JSX.Element {
  const { preamble, sections } = useMemo(
    () => parseMarkdownSections(content),
    [content],
  );

  const cls = "fm-accordion" + (className ? " " + className : "");

  if (sections.length === 0) {
    return (
      <div className={cls}>
        <MarkdownRenderer content={content} mode="rendered" />
      </div>
    );
  }

  return (
    <div className={cls}>
      {preamble && (
        <div className="fm-accordion-preamble">
          <MarkdownRenderer content={preamble} mode="rendered" />
        </div>
      )}
      <div className="fm-accordion-sections">
        {sections.map((section, i) => (
          <SectionAccordion key={i} section={section} />
        ))}
      </div>
    </div>
  );
}

function SectionAccordion({ section }: { section: Section }): JSX.Element {
  const [open, setOpen] = useState(false);
  const hasContent = Boolean(section.body) || section.subsections.length > 0;

  return (
    <div className="fm-accordion-section">
      <button
        type="button"
        className="fm-accordion-h1"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="fm-accordion-chip">H1</span>
        <ChevronRight
          size={16}
          strokeWidth={2.5}
          className={
            "fm-accordion-chevron" + (open ? " fm-accordion-chevron-open" : "")
          }
        />
        <span className="fm-accordion-title">{section.title}</span>
        {section.subsections.length > 0 && (
          <span className="fm-accordion-count">
            {section.subsections.length} nested
          </span>
        )}
      </button>
      {open && hasContent && (
        <div className="fm-accordion-body">
          {section.body && (
            <MarkdownRenderer content={section.body} mode="rendered" />
          )}
          {section.subsections.length > 0 && (
            <div className="fm-accordion-subsections">
              {section.subsections.map((sub, i) => (
                <SubSectionAccordion key={i} sub={sub} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SubSectionAccordion({ sub }: { sub: SubSection }): JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <div className="fm-accordion-subsection">
      <button
        type="button"
        className="fm-accordion-h2"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="fm-accordion-chip fm-accordion-chip-sm">H2</span>
        <ChevronRight
          size={14}
          strokeWidth={2.5}
          className={
            "fm-accordion-chevron" + (open ? " fm-accordion-chevron-open" : "")
          }
        />
        <span className="fm-accordion-title fm-accordion-title-sm">
          {sub.title}
        </span>
      </button>
      {open && sub.body && (
        <div className="fm-accordion-body">
          <MarkdownRenderer content={sub.body} mode="rendered" />
        </div>
      )}
    </div>
  );
}
