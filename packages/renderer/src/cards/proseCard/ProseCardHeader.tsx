import { type JSX } from "react";
import { AlignLeft, Copy, Rows3 } from "lucide-react";
import { type MarkdownMode } from "../../render/MarkdownRenderer.js";
import { formatWhen } from "../format.js";
import type { ProseCardModel } from "./model.js";

const NO_LOOSE_STRING_VALUES = {
  word: "word",
  words: "words",
  rendered: "rendered",
  accordion: "accordion",
} as const;

interface Props {
  model: ProseCardModel;
  mode: MarkdownMode;
  onModeChange: (mode: MarkdownMode) => void;
  onCopy: () => void;
}

export function ProseCardHeader({
  model,
  mode,
  onModeChange,
  onCopy,
}: Props): JSX.Element {
  return (
    <header className="prose-head">
      <div className="prose-title-row">
        <h2 className="prose-title-name" title={model.proseName}>
          {model.proseName}
        </h2>
        <div className="prose-meta">
          <span className="prose-meta-item prose-meta-words">
            {model.wordTotal} {model.wordTotal === 1 ? NO_LOOSE_STRING_VALUES.word : NO_LOOSE_STRING_VALUES.words}
          </span>
          <MarkdownModeToggle mode={mode} onModeChange={onModeChange} />
          <button
            type="button"
            className="prose-copy-btn"
            onClick={onCopy}
            aria-label="Copy as markdown"
            title="Copy as markdown"
          >
            <Copy size={13} aria-hidden />
          </button>
        </div>
      </div>
      <div className="prose-caption">
        <span className="prose-caption-who">{model.who.name}</span>
        <span className="prose-caption-when">
          {formatWhen(model.event.timestamp)}
        </span>
      </div>
    </header>
  );
}

function MarkdownModeToggle({
  mode,
  onModeChange,
}: {
  mode: MarkdownMode;
  onModeChange: (mode: MarkdownMode) => void;
}): JSX.Element {
  return (
    <div className="prose-toggle" role="group" aria-label="Markdown view mode">
      <button
        type="button"
        className={mode === "rendered" ? "on" : ""}
        onClick={() => onModeChange(NO_LOOSE_STRING_VALUES.rendered)}
        aria-label="Rendered view"
        aria-pressed={mode === "rendered"}
        title="Rendered"
      >
        <AlignLeft size={13} aria-hidden />
      </button>
      <button
        type="button"
        className={mode === "accordion" ? "on" : ""}
        onClick={() => onModeChange(NO_LOOSE_STRING_VALUES.accordion)}
        aria-label="Accordion view"
        aria-pressed={mode === "accordion"}
        title="Accordion"
      >
        <Rows3 size={13} aria-hidden />
      </button>
    </div>
  );
}
