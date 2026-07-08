import { type JSX } from "react";
import { ChoicesPreviewGrid } from "./ChoicesPreviewGrid.js";
import { TextChoiceOptions } from "./TextChoiceOptions.js";
import type { ChoicesCardModel } from "./types.js";

interface ChoicesOptionsProps {
  model: ChoicesCardModel;
}

export function ChoicesOptions({ model }: ChoicesOptionsProps): JSX.Element {
  return model.hasHtml ? (
    <ChoicesPreviewGrid model={model} />
  ) : (
    <TextChoiceOptions model={model} />
  );
}
