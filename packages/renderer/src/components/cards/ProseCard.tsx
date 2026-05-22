import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { AnyEventRecord, Participant, ProsePayload } from "@f-mark/shared";
import { useStore } from "../../state/store.js";
import { CommentBubble } from "./CommentBubble.js";

interface Props {
  event: AnyEventRecord;
  participant?: Participant;
  comments: AnyEventRecord[];
}

export function ProseCard({ event, participant, comments }: Props): JSX.Element {
  const payload = event.payload as ProsePayload;
  const isNamed = payload.name !== undefined;
  const color = participant?.color ?? "#999";
  return (
    <article
      className={[
        "rounded-md border border-neutral-200 bg-white",
        isNamed ? "p-5" : "p-3",
      ].join(" ")}
    >
      <header className="mb-2 flex items-center gap-2 text-xs">
        <span
          className="inline-block h-2 w-2 rounded-full"
          aria-hidden
          style={{ backgroundColor: color }}
        />
        <span className="text-neutral-700">
          {participant?.name ?? event.participant_id}
        </span>
        {isNamed && (
          <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-neutral-600">
            {payload.name}
          </span>
        )}
        <span className="ml-auto text-neutral-400">{event.timestamp}</span>
        <CommentLink filename={event.filename} />
      </header>
      <div
        className={
          isNamed ? "prose prose-sm max-w-none" : "text-sm text-neutral-800"
        }
      >
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{payload.content}</ReactMarkdown>
      </div>
      {comments.length > 0 && (
        <ul className="mt-3 space-y-2 border-t border-neutral-200 pt-2">
          {comments.map((c) => (
            <li key={c.filename}>
              <CommentBubble event={c} />
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

function CommentLink({ filename }: { filename: string }): JSX.Element {
  const setCommentTarget = useStore((s) => s.setCommentTarget);
  return (
    <button
      className="text-neutral-400 hover:text-neutral-700"
      onClick={() => setCommentTarget({ file: filename })}
      title="Comment"
    >
      💬
    </button>
  );
}
