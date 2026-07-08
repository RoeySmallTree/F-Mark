import { type JSX } from "react";
import {
  File as FileIcon,
  FileText,
  FileSpreadsheet,
  Image as ImageIcon,
  Loader2,
  Music,
  Video,
  X,
} from "lucide-react";
import type { FilePreviewKind } from "@f-mark/shared";

const NO_LOOSE_STRING_VALUES = {
  image: "image",
} as const;

export interface StagedAttachment {
  id: string;
  displayName: string;
  mimeType: string;
  sizeBytes: number;
  path: string;
  previewKind: FilePreviewKind;
  uploading: boolean;
  /* Object URL for an image thumbnail; revoked when the chip is removed
     or successfully sent. Null for non-images. */
  previewUrl: string | null;
  error?: string;
}

interface Props {
  attachment: StagedAttachment;
  onRemove(id: string): void;
}

const ICON_BY_KIND: Record<FilePreviewKind, typeof FileIcon> = {
  image: ImageIcon,
  video: Video,
  audio: Music,
  text: FileText,
  pdf: FileText,
  csv: FileSpreadsheet,
  xlsx: FileSpreadsheet,
  docx: FileText,
  pptx: FileText,
  file: FileIcon,
};

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AttachmentChip({ attachment, onRemove }: Props): JSX.Element {
  const Icon = ICON_BY_KIND[attachment.previewKind] ?? FileIcon;
  const isImage =
    attachment.previewKind === NO_LOOSE_STRING_VALUES.image && attachment.previewUrl !== null;
  return (
    <div
      className={`compose-attachment${attachment.error ? " is-error" : ""}`}
      title={attachment.displayName}
    >
      <div className="compose-attachment-preview">
        {isImage ? (
          <img src={attachment.previewUrl!} alt="" />
        ) : (
          <Icon size={18} aria-hidden />
        )}
        {attachment.uploading ? (
          <div className="compose-attachment-spinner" aria-hidden>
            <Loader2 size={14} />
          </div>
        ) : null}
      </div>
      <div className="compose-attachment-meta">
        <div className="compose-attachment-name">{attachment.displayName}</div>
        <div className="compose-attachment-size">
          {humanSize(attachment.sizeBytes)}
        </div>
      </div>
      <button
        type="button"
        className="compose-attachment-remove"
        onClick={() => onRemove(attachment.id)}
        aria-label={`Remove ${attachment.displayName}`}
        title="Remove"
      >
        <X size={14} aria-hidden />
      </button>
    </div>
  );
}
