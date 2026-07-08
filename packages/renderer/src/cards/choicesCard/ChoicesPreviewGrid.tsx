import { type JSX } from "react";
import { Maximize2 } from "lucide-react";
import { HtmlPreviewFrame } from "../../components/HtmlPreviewFrame.js";
import type { ChoiceOption, ChoicesCardModel } from "./types.js";

const NO_LOOSE_STRING_VALUES = {
  choicePreviewFrame: "choice-preview-frame",
} as const;

interface ChoicesPreviewGridProps {
  model: ChoicesCardModel;
}

export function ChoicesPreviewGrid({
  model,
}: ChoicesPreviewGridProps): JSX.Element {
  return (
    <div className="choices-options-grid">
      {model.payload.options.map((option) => (
        <ChoicePreviewCard key={option.id} model={model} option={option} />
      ))}
    </div>
  );
}

interface ChoicePreviewCardProps {
  model: ChoicesCardModel;
  option: ChoiceOption;
}

function ChoicePreviewCard({
  model,
  option,
}: ChoicePreviewCardProps): JSX.Element {
  const chosen = model.selectedIds.includes(option.id);
  const faded = model.selectedIds.length > 0 && !chosen;
  const html =
    typeof option.html === "string" && option.html.length > 0
      ? option.html
      : null;
  return (
    <div
      className={[
        "choice-preview-card",
        chosen ? "chosen" : "",
        faded ? "faded" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <button
        type="button"
        className="choice-preview-select"
        aria-pressed={chosen}
        onClick={() => void model.pick(option.id)}
      >
        <span className="choice-radio" aria-hidden />
        <span className="lbl">
          {option.label}
          {chosen ? <span className="check">Chose</span> : null}
        </span>
      </button>
      {html !== null ? (
        <ChoicePreviewFrame model={model} option={option} html={html} />
      ) : (
        <ChoiceTextPlaceholder />
      )}
    </div>
  );
}

function ChoicePreviewFrame({
  model,
  option,
  html,
}: ChoicePreviewCardProps & { html: string }): JSX.Element {
  return (
    <>
      <HtmlPreviewFrame
        sessionId={model.sessionId}
        filename={html}
        title={option.label}
        frameClassName={NO_LOOSE_STRING_VALUES.choicePreviewFrame}
      />
      <div className="choice-preview-foot">
        <button
          type="button"
          onClick={() => model.openPreview(html, option.label)}
        >
          <Maximize2 size={11} aria-hidden /> Fullscreen
        </button>
      </div>
    </>
  );
}

function ChoiceTextPlaceholder(): JSX.Element {
  return (
    <div className="choice-preview-frame">
      <div className="placeholder">
        <div className="label">text option</div>
      </div>
    </div>
  );
}
