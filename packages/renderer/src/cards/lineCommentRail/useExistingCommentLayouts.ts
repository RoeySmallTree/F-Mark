import { useMemo } from "react";
import type {
  AnyEventRecord,
  Participant,
} from "@f-mark/shared";
import {
  buildAnchorGroups,
  type AnchorGroup,
} from "./commentData.js";
import {
  layoutMarkers,
  type LineBox,
  type MarkerLayout,
} from "./lineGeometry.js";

export function useExistingCommentLayouts({
  comments,
  participants,
  lineCount,
  lineHeight,
  lineBoxes,
}: {
  comments: AnyEventRecord[];
  participants: Record<string, Participant>;
  lineCount: number;
  lineHeight: number;
  lineBoxes: LineBox[];
}): MarkerLayout<AnchorGroup>[] {
  const anchors = useMemo(
    () => buildAnchorGroups(comments, participants, lineCount),
    [comments, lineCount, participants],
  );
  return useMemo(
    () => layoutMarkers(anchors, lineHeight, lineBoxes),
    [anchors, lineHeight, lineBoxes],
  );
}
