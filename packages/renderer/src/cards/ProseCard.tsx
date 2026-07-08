const NO_LOOSE_STRING_VALUES = {
  rendered: "rendered",
} as const;

/* ProseCard — named-prose card. The head holds the prose name (accent-coloured
   left) and a meta cluster (word count • view toggle • copy) on the right,
   with a small caption row underneath for participant + timestamp.
   The body renders frontmatter pointers, markdown content (rendered or
   accordion mode), and a right-side line comment rail.
*/

import { useState, type JSX } from "react";
import type {
  AnyEventRecord,
  Participant,
} from "@f-mark/shared";
import { type MarkdownMode } from "../render/MarkdownRenderer.js";
import { useStore } from "../state/store.js";
import { copyToClipboard } from "../render/copy.js";
import { ProseCardBody } from "./proseCard/ProseCardBody.js";
import { ProseCardHeader } from "./proseCard/ProseCardHeader.js";
import { ProseCardModel } from "./proseCard/model.js";

interface Props {
  event: AnyEventRecord;
  participants: Record<string, Participant>;
  comments: AnyEventRecord[];
  /** Blocks appended to this anchor via `append_to`. Already sorted by
   *  root-filename slot order in the aggregate. */
  blocks?: AnyEventRecord[];
  /** Per-block comment lookup for line-comments on individual blocks. */
  commentsByFilename?: Map<string, AnyEventRecord[]>;
}

export function ProseCard({
  event,
  participants,
  comments,
  blocks = [],
  commentsByFilename,
}: Props): JSX.Element {
  const [mode, setMode] = useState<MarkdownMode>(NO_LOOSE_STRING_VALUES.rendered);
  const commentTarget = useStore((s) => s.commentTarget);
  const model = new ProseCardModel(
    event,
    participants,
    comments,
    blocks,
    commentsByFilename,
    commentTarget,
  );

  async function onCopy(): Promise<void> {
    await copyToClipboard(model.payload.content);
  }

  return (
    <article className={model.classes} data-event-kind="prose-named">
      <ProseCardHeader
        model={model}
        mode={mode}
        onModeChange={setMode}
        onCopy={() => void onCopy()}
      />
      <ProseCardBody model={model} mode={mode} />
    </article>
  );
}
