import type { JSX } from "react";
import { SessionRowView } from "./sessionRow/SessionRowView.js";
import type { SessionRowProps } from "./sessionRow/types.js";

export function SessionRow(props: SessionRowProps): JSX.Element {
  return <SessionRowView {...props} />;
}
