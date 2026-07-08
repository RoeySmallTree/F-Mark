import type { JSX } from "react";
import { PrimaryActionRow } from "./composeToolbar/PrimaryActionRow.js";
import { SecondaryActionRow } from "./composeToolbar/SecondaryActionRow.js";
import type { ComposeToolbarProps } from "./composeToolbar/types.js";

export type { ComposeToolbarProps };

export function ComposeToolbar(props: ComposeToolbarProps): JSX.Element {
  return (
    <div className="compose-actions">
      <PrimaryActionRow {...props} />
      <SecondaryActionRow {...props} />
    </div>
  );
}

