import { type JSX } from "react";
import { ChoicesPreviewGrid } from "./ChoicesPreviewGrid.js";
import { CustomChoiceInput } from "./CustomChoiceInput.js";
import { TextChoiceOptions, TextCustomChoiceOptions } from "./TextChoiceOptions.js";
import type { ChoicesCardModel } from "./types.js";

interface ChoicesOptionsProps {
  model: ChoicesCardModel;
}

export function ChoicesOptions({ model }: ChoicesOptionsProps): JSX.Element {
  return (
    <>
      {model.hasHtml ? (
        <>
          <ChoicesPreviewGrid model={model} />
          <TextCustomChoiceOptions model={model} />
        </>
      ) : (
        <TextChoiceOptions model={model} />
      )}
      <CustomChoiceInput model={model} />
    </>
  );
}
