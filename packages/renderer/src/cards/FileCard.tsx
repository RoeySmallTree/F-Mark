/* FileCard — surfaces a file event with a placeholder striped thumbnail,
   filename, mime, description, and a Download anchor pointing at the
   kernel's `/sessions/:id/raw/:filename` route. */

import { type JSX } from "react";
import { Paperclip } from "lucide-react";
import type {
  AnyEventRecord,
  FileRefPayload,
  Participant,
} from "@f-mark/shared";
import { useStore } from "../state/store.js";
import { formatWhen, whoOf } from "./format.js";

interface Props {
  event: AnyEventRecord;
  participants: Record<string, Participant>;
}

function shortKind(mime: string): string {
  const slash = mime.indexOf("/");
  if (slash === -1) return mime.slice(0, 4).toUpperCase();
  return mime.slice(slash + 1).toUpperCase().slice(0, 4);
}

export function FileCard({ event, participants }: Props): JSX.Element {
  const payload = event.payload as FileRefPayload;
  const who = whoOf(event.participant_id, participants);
  const sessionId = useStore((s) => s.currentSessionId);
  const token = useStore((s) => s.token);
  const filename = payload.path.split("/").pop() ?? payload.path;
  const href =
    sessionId !== null
      ? `/sessions/${sessionId}/raw/${encodeURIComponent(payload.path)}${
          token !== null && token.length > 0
            ? `?token=${encodeURIComponent(token)}`
            : ""
        }`
      : "#";

  return (
    <div data-event-kind="file">
      <div className="card-head" style={{ paddingLeft: 0, marginBottom: 8 }}>
        <span
          className={["avatar", who.isUser ? "user" : "agent", "sm"].join(" ")}
          aria-hidden
        >
          {who.initial}
        </span>
        <span className="who">{who.name}</span>
        <span className="when">{formatWhen(event.timestamp)}</span>
        <span className="badge">
          <Paperclip size={10} aria-hidden /> FILE
        </span>
      </div>
      <div className="file-card">
        <div className="file-thumb" aria-hidden>
          {shortKind(payload.mime_type)}
        </div>
        <div className="file-info">
          <div className="file-name">{filename}</div>
          <div className="file-meta">{payload.mime_type}</div>
          {payload.description !== undefined && payload.description.length > 0 && (
            <div className="file-desc">"{payload.description}"</div>
          )}
        </div>
        <div className="file-actions">
          <a href={href} download={filename}>
            Download
          </a>
        </div>
      </div>
    </div>
  );
}
