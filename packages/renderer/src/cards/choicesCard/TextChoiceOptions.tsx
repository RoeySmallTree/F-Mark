import { type JSX } from "react";
import type { ChoiceOption, ChoicesCardModel } from "./types.js";

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
    </>
  );
}

interface TextChoiceOptionProps {
  model: ChoicesCardModel;
  option: ChoiceOption;
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
  );
}
