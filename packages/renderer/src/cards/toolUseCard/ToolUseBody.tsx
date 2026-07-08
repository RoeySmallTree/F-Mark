import type { JSX, MutableRefObject } from "react";
import {
  renderPresentationSections,
  renderRawDetails,
  type ToolPresentation,
} from "../toolPresentation.js";

interface ToolUseBodyProps {
  bodyExpanded: boolean;
  bodyOverflowing: boolean;
  bodyRef: MutableRefObject<HTMLDivElement | null>;
  onExpand: () => void;
  presentation: ToolPresentation;
}

export function ToolUseBody({
  bodyExpanded,
  bodyOverflowing,
  bodyRef,
  onExpand,
  presentation,
}: ToolUseBodyProps): JSX.Element {
  const capped = bodyOverflowing && !bodyExpanded;

  return (
    <div className="tool-body-frame">
      <div className={`tool-body-viewport${capped ? " capped" : ""}`}>
        <div className="tool-body" ref={bodyRef}>
          {presentation.summary !== undefined ? (
            <p className="tool-summary-line">{presentation.summary}</p>
          ) : null}
          {renderPresentationSections(presentation.sections)}
          {presentation.raw !== undefined ? renderRawDetails(presentation.raw) : null}
        </div>
      </div>
      {capped ? (
        <button
          type="button"
          className="tool-body-expand"
          aria-label="Show full tool output"
          onClick={onExpand}
        >
          <svg
            className="tool-body-expand-icon"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
          >
            <path d="M4.25 6.25 8 10l3.75-3.75" />
          </svg>
          <span>Show full</span>
        </button>
      ) : null}
    </div>
  );
}
