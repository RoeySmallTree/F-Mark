import { type JSX } from "react";
import { ChoiceOptionComments } from "./ChoiceOptionComments.js";
import type {
  ChoiceCommentTarget,
  ChoiceOption,
  ChoicesCardModel,
} from "./types.js";

const NO_LOOSE_STRING_VALUES = {
  choiceOpt: "choice-opt",
  chosen: "chosen",
  faded: "faded",
} as const;

interface TextChoiceOptionsProps {
  model: ChoicesCardModel;
}

export function TextChoiceOptions({
  model,
}: TextChoiceOptionsProps): JSX.Element {
  return (
    <>
      {model.payload.options.map((option) => (
        <TextChoiceOption key={option.id} model={model} option={option} />
      ))}
      <TextCustomChoiceOptions model={model} />
    </>
  );
}

export function TextCustomChoiceOptions({
  model,
}: TextChoiceOptionsProps): JSX.Element | null {
  if (model.customOptions.length === 0) return null;
  return (
    <div className="choice-custom-selected" aria-label="Custom selected options">
      {model.customOptions.map((option) => (
        <TextChoiceOption key={option.id} model={model} option={option} />
      ))}
    </div>
  );
}

interface TextChoiceOptionProps {
  model: ChoicesCardModel;
  option: ChoiceOption | ChoiceCommentTarget;
}

function TextChoiceOption({
  model,
  option,
}: TextChoiceOptionProps): JSX.Element {
  const chosen = model.selectedIds.includes(option.id);
  const faded = model.selectedIds.length > 0 && !chosen;
  const classes = [NO_LOOSE_STRING_VALUES.choiceOpt, chosen ? NO_LOOSE_STRING_VALUES.chosen : "", faded ? NO_LOOSE_STRING_VALUES.faded : ""]
    .filter(Boolean)
    .join(" ");
  return (
    <div className="choice-option-shell">
      <button
        type="button"
        className={classes}
        aria-pressed={chosen}
        onClick={() => void model.pick(option.id)}
      >
        <span className="choice-radio" aria-hidden />
        <span style={{ flex: 1 }}>
          <span className="lbl">
            {option.label}
            {chosen ? <span className="check">Chose</span> : null}
          </span>
        </span>
      </button>
      <ChoiceOptionComments model={model} option={option} />
    </div>
  );
}
