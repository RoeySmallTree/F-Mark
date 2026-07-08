import { useState, type FormEvent, type JSX } from "react";
import type { ChoiceCommentTarget, ChoicesCardModel } from "./types.js";

const buttonCopy = {
  posting: "Posting…",
  postComment: "Post comment",
} as const;

interface ChoiceOptionCommentsProps {
  model: ChoicesCardModel;
  option: ChoiceCommentTarget;
}

export function ChoiceOptionComments({
  model,
  option,
}: ChoiceOptionCommentsProps): JSX.Element {
  const comments = model.commentsForOption(option);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const trimmed = draft.trim();
    if (trimmed.length === 0 || busy) return;
    setBusy(true);
    try {
      await model.commentOnOption(option, trimmed);
      setDraft("");
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="choice-comment-suite">
      {comments.length > 0 ? (
        <div className="choice-comment-list" aria-label={`Comments on ${option.label}`}>
          {comments.map((comment) => (
            <div className="choice-comment" key={comment.filename}>
              <div className="choice-comment-meta">
                <span>{comment.author}</span>
                <span>{model.formatTimestamp(comment.timestamp)}</span>
              </div>
              <div className="choice-comment-body">{comment.body}</div>
            </div>
          ))}
        </div>
      ) : null}
      {open ? (
        <form className="choice-comment-form" onSubmit={(event) => void submit(event)}>
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={2}
            aria-label={`Comment on option ${option.label}`}
            placeholder={`Comment on ${option.label}`}
          />
          <div className="choice-comment-actions">
            <button
              type="button"
              className="choice-comment-cancel"
              onClick={() => {
                setDraft("");
                setOpen(false);
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="choice-comment-submit"
              disabled={busy || draft.trim().length === 0}
            >
              {busy ? buttonCopy.posting : buttonCopy.postComment}
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          className="choice-comment-trigger"
          onClick={() => setOpen(true)}
          aria-label={`Comment on ${option.label}`}
        >
          Comment
        </button>
      )}
    </div>
  );
}
