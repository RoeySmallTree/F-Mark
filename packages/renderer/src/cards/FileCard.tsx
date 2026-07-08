import { type JSX } from "react";
import type { AnyEventRecord, FileRefPayload, Participant } from "@f-mark/shared";
import { useCurrentSessionRootScope } from "../hooks/useCurrentSessionRootScope.js";
import { useStore } from "../state/store.js";
import { whoOf } from "./format.js";
import {
  FileCardBody,
  FileEventHeader,
} from "./fileCard/FileCardShell.js";
import { hrefFor } from "./fileCard/links.js";
import { displayName } from "./fileCard/names.js";
import { previewKind } from "./fileCard/previewKind.js";

const NO_LOOSE_STRING_VALUES = {
  event: "event",
} as const;

interface Props {
  event: AnyEventRecord;
  participants: Record<string, Participant>;
  comments?: AnyEventRecord[];
}

export function FileCard({
  event,
  participants,
  comments = [],
}: Props): JSX.Element {
  const payload = event.payload as FileRefPayload;
  const who = whoOf(event.participant_id, participants);
  const sessionId = useStore((s) => s.currentSessionId);
  const token = useStore((s) => s.token);
  const scope = useCurrentSessionRootScope(sessionId);
  const setCommentTarget = useStore((s) => s.setCommentTarget);
  const commentTarget = useStore((s) => s.commentTarget);
  const name = displayName(payload);
  const href = hrefFor({ sessionId, payload, token, scope });
  const kind = previewKind(payload);
  const isFocused =
    commentTarget !== null &&
    commentTarget.kind === NO_LOOSE_STRING_VALUES.event &&
    commentTarget.file === event.filename;

  return (
    <div data-event-kind="file">
      <FileEventHeader who={who} timestamp={event.timestamp} />
      <FileCardBody
        commentsCount={comments.length}
        name={name}
        href={href}
        isFocused={isFocused}
        kind={kind}
        payload={payload}
        onComment={() =>
          setCommentTarget({ kind: NO_LOOSE_STRING_VALUES.event, file: event.filename })
        }
      />
    </div>
  );
}
