import type { AnyEventRecord } from "@f-mark/shared";

interface Props {
  event: AnyEventRecord;
}

export function TurnEndMarker({ event }: Props): JSX.Element {
  return (
    <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-neutral-400">
      <span className="h-px flex-1 bg-neutral-200" />
      <span>turn ended · {event.participant_id}</span>
      <span className="h-px flex-1 bg-neutral-200" />
    </div>
  );
}
