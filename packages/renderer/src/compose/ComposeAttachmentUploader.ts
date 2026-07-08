import type {
  FilePreviewKind,
  UploadAttachmentResponse,
} from "@f-mark/shared";
import type { RootScope, UploadAttachmentInput } from "../api/client.js";
import type { StagedAttachment } from "./AttachmentChip.js";

const NO_LOOSE_STRING_VALUES = {
  pastedFile: "pasted-file",
  image: "image",
  video: "video",
  audio: "audio",
  text: "text",
  file: "file",
  octetStream: "application/octet-stream",
} as const;

const mimePrefixes = {
  image: "image/",
  video: "video/",
  audio: "audio/",
  text: "text/",
} as const;

const mimeTokens = {
  json: "json",
  xml: "xml",
  javascript: "javascript",
  typescript: "typescript",
} as const;

const TEXT_NAME_RE =
  /\.(mdx?|markdown|txt|log|jsonc?|xml|ya?ml|toml|html?|css|s[ac]ss|less|[cm]?[jt]sx?|ts|tsx|jsx|py|go|rs|rb|java|c|h|cpp|cc|hpp|cs|php|swift|kts?|sh|bash|zsh|fish|lua|dart|scala|exs?|clj|cljs|vue|svelte|ini|conf|cfg|env|sql|graphql|gql|proto|dockerfile|makefile)$/i;

interface AttachmentUploadClient {
  uploadAttachment(
    sessionId: string,
    input: UploadAttachmentInput,
    scope?: RootScope,
  ): Promise<UploadAttachmentResponse>;
}

interface ComposeAttachmentUploaderOptions {
  client: AttachmentUploadClient;
  sessionId: string;
  userId: string | null;
  scope: RootScope;
  setAttachments(
    updater: (prev: StagedAttachment[]) => StagedAttachment[],
  ): void;
}

export class ComposeAttachmentUploader {
  constructor(private readonly options: ComposeAttachmentUploaderOptions) {}

  async stage(file: File): Promise<void> {
    const placeholder = placeholderForFile(file);
    this.options.setAttachments((prev) => [...prev, placeholder]);
    try {
      const meta = await this.options.client.uploadAttachment(
        this.options.sessionId,
        uploadInputForFile(file, this.options.userId),
        this.options.scope,
      );
      this.replacePlaceholder(placeholder.id, meta);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.markUploadFailed(placeholder.id, message);
    }
  }

  private replacePlaceholder(
    tempId: string,
    meta: UploadAttachmentResponse,
  ): void {
    this.options.setAttachments((prev) =>
      prev.map((attachment) =>
        attachment.id === tempId
          ? attachmentFromUpload(attachment, meta)
          : attachment,
      ),
    );
  }

  private markUploadFailed(tempId: string, error: string): void {
    this.options.setAttachments((prev) =>
      prev.map((attachment) =>
        attachment.id === tempId
          ? { ...attachment, uploading: false, error }
          : attachment,
      ),
    );
  }
}

function uploadInputForFile(
  file: File,
  userId: string | null,
): UploadAttachmentInput {
  return {
    file,
    display_name: file.name || undefined,
    ...(userId !== null ? { participant_id: userId } : {}),
  };
}

function placeholderForFile(file: File): StagedAttachment {
  return {
    id: `tmp_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`,
    displayName: file.name || NO_LOOSE_STRING_VALUES.pastedFile,
    mimeType: file.type || NO_LOOSE_STRING_VALUES.octetStream,
    sizeBytes: file.size,
    path: "",
    previewKind: previewKindFor(file),
    uploading: true,
    previewUrl: file.type.startsWith(mimePrefixes.image)
      ? URL.createObjectURL(file)
      : null,
  };
}

function previewKindFor(file: File): FilePreviewKind {
  const type = file.type.toLowerCase();
  if (type.startsWith(mimePrefixes.image)) return NO_LOOSE_STRING_VALUES.image;
  if (type.startsWith(mimePrefixes.video)) return NO_LOOSE_STRING_VALUES.video;
  if (type.startsWith(mimePrefixes.audio)) return NO_LOOSE_STRING_VALUES.audio;
  if (
    type.startsWith(mimePrefixes.text) ||
    type.includes(mimeTokens.json) ||
    type.includes(mimeTokens.xml) ||
    type.includes(mimeTokens.javascript) ||
    type.includes(mimeTokens.typescript) ||
    TEXT_NAME_RE.test(file.name)
  ) {
    return NO_LOOSE_STRING_VALUES.text;
  }
  return NO_LOOSE_STRING_VALUES.file;
}

function attachmentFromUpload(
  placeholder: StagedAttachment,
  meta: UploadAttachmentResponse,
): StagedAttachment {
  return {
    ...placeholder,
    id: meta.id,
    displayName: meta.display_name,
    mimeType: meta.mime_type,
    sizeBytes: meta.size_bytes,
    path: meta.path,
    previewKind: meta.preview_kind,
    uploading: false,
  };
}
