import type { JSX } from "react";
import { LineMarker } from "../../../../cards/lineCommentRail/LineMarker.js";
import type { LineBox, LineRange } from "../lineMeasure.js";

const NO_LOOSE_STRING_VALUES = {
  draft: "draft",
} as const;

interface RenderedRailMarkerProps {
  lines: LineRange;
  box: LineBox;
  count: number | null;
  active: boolean;
  kind: "existing" | "draft";
  resolved?: boolean;
  label: string;
  onClick(): void;
}

export function RenderedRailMarker({
  lines,
  box,
  count,
  active,
  kind,
  resolved = false,
  label,
  onClick,
}: RenderedRailMarkerProps): JSX.Element {
  const color = resolved
    ? "var(--green)"
    : kind === NO_LOOSE_STRING_VALUES.draft
      ? "var(--user)"
      : "var(--agent)";
  return (
    <LineMarker
      lines={lines}
      box={box}
      count={count}
      color={color}
      active={active}
      kind={kind}
      resolved={resolved}
      label={label}
      onClick={onClick}
    />
  );
}
