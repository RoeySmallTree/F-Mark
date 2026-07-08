import type { Dispatch, JSX, RefObject, SetStateAction } from "react";

interface LineCommentDraftTextareaProps {
  draft: string;
  setDraft: Dispatch<SetStateAction<string>>;
  textareaRef: RefObject<HTMLTextAreaElement>;
  onCloseDraft(): void;
  onOpenMentions(): void;
  onSubmit(): Promise<void>;
}

export function LineCommentDraftTextarea({
  draft,
  setDraft,
  textareaRef,
  onCloseDraft,
  onOpenMentions,
  onSubmit,
}: LineCommentDraftTextareaProps): JSX.Element {
  return (
    <textarea
      ref={textareaRef}
      value={draft}
      onChange={(event) => {
        setDraft(event.target.value);
        if (event.target.value.endsWith("@")) onOpenMentions();
      }}
      placeholder="Add a comment…"
      rows={3}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onCloseDraft();
          return;
        }
        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
          event.preventDefault();
          void onSubmit();
        }
      }}
    />
  );
}
