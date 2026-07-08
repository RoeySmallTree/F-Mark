import type { FileRefPayload } from "@f-mark/shared";

interface FileMetaInput {
  payload: FileRefPayload;
  commentCount: number;
}

export function displayName(payload: FileRefPayload): string {
  return payload.display_name ?? payload.path.split("/").pop() ?? payload.path;
}

function shortBytes(bytes: number | undefined): string | null {
  if (bytes === undefined) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function fileMetaText({ payload, commentCount }: FileMetaInput): string {
  const size = shortBytes(payload.size_bytes);
  const parts = [payload.mime_type];
  if (size !== null) parts.push(size);
  if (commentCount > 0) {
    parts.push(`${commentCount} comment${commentCount === 1 ? "" : "s"}`);
  }
  return parts.join(" · ");
}
