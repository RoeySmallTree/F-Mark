import type { AnyEventRecord, ProsePayload } from "@f-mark/shared";

interface Props {
  event: AnyEventRecord;
}

export function CommentBubble({ event }: Props): JSX.Element {
  const payload = event.payload as ProsePayload;
  return (
    <div className="rounded border border-neutral-100 bg-neutral-50 p-2 text-xs text-neutral-700">
      <div className="mb-1 text-neutral-500">📌 {event.participant_id}</div>
      <p>{payload.content}</p>
    </div>
  );
}
