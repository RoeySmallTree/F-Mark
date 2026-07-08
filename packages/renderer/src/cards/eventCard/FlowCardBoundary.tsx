import { type JSX, lazy, Suspense } from "react";
import type { AnyEventRecord, Participant } from "@f-mark/shared";

/* FlowCard pulls @xyflow/react (~250 KB) + dagre (~150 KB). Lazy-load so
   the main bundle stays slim — flow events are uncommon and the feed
   already renders incrementally. */
const FlowCard = lazy(() =>
  import("../FlowCard.js").then((module) => ({ default: module.FlowCard })),
);

interface FlowCardBoundaryProps {
  event: AnyEventRecord;
  participants: Record<string, Participant>;
}

export function FlowCardBoundary({
  event,
  participants,
}: FlowCardBoundaryProps): JSX.Element {
  return (
    <Suspense fallback={<div className="flow-card" data-event-kind="flow" />}>
      <FlowCard event={event} participants={participants} />
    </Suspense>
  );
}
