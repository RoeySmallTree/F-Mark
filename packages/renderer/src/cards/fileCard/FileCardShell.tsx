import { Download, FileText, MessageSquare } from "lucide-react";
import type { FilePreviewKind, FileRefPayload } from "@f-mark/shared";
import { type JSX } from "react";
import { type WhoInfo } from "../format.js";
import { EventCardHeader } from "../EventCardHeader.js";
import { FilePreview } from "./FilePreview.js";
import { fileMetaText } from "./names.js";

interface FileEventHeaderProps {
  who: WhoInfo;
  timestamp: string;
}

interface FileCardBodyProps {
  payload: FileRefPayload;
  commentsCount: number;
  name: string;
  href: string;
  kind: FilePreviewKind;
  isFocused: boolean;
  onComment: () => void;
}

interface FileActionsProps {
  name: string;
  href: string;
  onComment: () => void;
}

export function FileEventHeader({
  who,
  timestamp,
}: FileEventHeaderProps): JSX.Element {
  return (
    <EventCardHeader
      className="card-head"
      style={{ paddingLeft: 0, marginBottom: 8 }}
      who={who}
      timestamp={timestamp}
    >
      <span className="badge">
        <FileText size={10} aria-hidden /> FILE
      </span>
    </EventCardHeader>
  );
}

function FileActions({
  name,
  href,
  onComment,
}: FileActionsProps): JSX.Element {
  return (
    <>
      <button
        type="button"
        onClick={onComment}
        aria-label="Comment on file"
        title="Comment on file"
      >
        <MessageSquare size={13} aria-hidden />
      </button>
      <a
        href={href}
        download={name}
        aria-label="Download file"
        title="Download file"
      >
        <Download size={13} aria-hidden />
      </a>
    </>
  );
}

export function FileCardBody({
  payload,
  commentsCount,
  name,
  href,
  kind,
  isFocused,
  onComment,
}: FileCardBodyProps): JSX.Element {
  return (
    <article className={`file-card${isFocused ? " focused" : ""}`}>
      <header className="file-card-head">
        <div className="file-icon" aria-hidden>
          <FileText size={18} />
        </div>
        <div className="file-title">
          <div className="file-name">{name}</div>
          <div className="file-meta">
            {fileMetaText({ payload, commentCount: commentsCount })}
          </div>
          {payload.description !== undefined && payload.description.length > 0 && (
            <div className="file-desc">"{payload.description}"</div>
          )}
        </div>
        <div className="file-actions">
          <FileActions
            name={name}
            href={href}
            onComment={onComment}
          />
        </div>
      </header>
      <div className="file-preview">
        <FilePreview kind={kind} url={href} name={name} />
      </div>
    </article>
  );
}
