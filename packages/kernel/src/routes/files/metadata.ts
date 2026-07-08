import type { FilePreviewKind } from "@f-mark/shared";

export const FILE_PREVIEW_KINDS = [
  "image",
  "video",
  "audio",
  "text",
  "pdf",
  "csv",
  "docx",
  "xlsx",
  "pptx",
  "file",
] as const satisfies readonly FilePreviewKind[];

const MIME_EXTENSIONS = new Map<string, string>([
  ["image/png", ".png"],
  ["image/jpeg", ".jpg"],
  ["image/gif", ".gif"],
  ["image/webp", ".webp"],
  ["image/svg+xml", ".svg"],
  ["video/mp4", ".mp4"],
  ["video/webm", ".webm"],
  ["video/quicktime", ".mov"],
  ["audio/mpeg", ".mp3"],
  ["audio/wav", ".wav"],
  ["audio/ogg", ".ogg"],
  ["application/pdf", ".pdf"],
  ["text/csv", ".csv"],
]);

const EXACT_MIME_KINDS = new Map<string, FilePreviewKind>([
  ["application/pdf", "pdf"],
  ["text/csv", "csv"],
]);

const EXTENSION_KINDS: Array<[RegExp, FilePreviewKind]> = [
  [/\.(png|jpe?g|gif|webp|svg|ico|bmp|tiff?|avif)$/i, "image"],
  [/\.(mp4|m4v|webm|mov|mkv|avi|ogv)$/i, "video"],
  [/\.(mp3|wav|ogg|oga|flac|m4a|opus|aac)$/i, "audio"],
  [/\.pdf$/, "pdf"],
  [/\.csv$/, "csv"],
  [/\.docx$/, "docx"],
  [/\.xlsx?$/, "xlsx"],
  [/\.pptx?$/, "pptx"],
];

const TEXT_EXTENSION_RE =
  /\.(mdx?|markdown|txt|log|jsonc?|xml|ya?ml|toml|html?|css|s[ac]ss|less|[cm]?[jt]sx?|ts|tsx|jsx|py|go|rs|rb|java|c|h|cpp|cc|hpp|cs|php|swift|kts?|sh|bash|zsh|fish|lua|dart|scala|exs?|clj|cljs|vue|svelte|ini|conf|cfg|env|sql|graphql|gql|proto|dockerfile|makefile)$/i;

function extForMime(mimeType: string): string {
  const mime = mimeType.toLowerCase();
  return MIME_EXTENSIONS.get(mime) ?? (mime.startsWith("text/") ? ".txt" : ".bin");
}

export function displayNameFor(
  filename: string | undefined,
  mimeType: string,
): string {
  const basename = filename?.split(/[\\/]/).pop()?.trim();
  if (basename !== undefined && basename.length > 0) return basename;
  const stem = mimeType.toLowerCase().startsWith("image/")
    ? "pasted-image"
    : "pasted-file";
  return `${stem}${extForMime(mimeType)}`;
}

export function safePathName(displayName: string, mimeType: string): string {
  const basename = displayNameFor(displayName, mimeType)
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  if (basename.length === 0 || basename === "." || basename === "..") {
    return displayNameFor(undefined, mimeType);
  }
  return basename.slice(0, 180);
}

function extensionPreviewKind(name: string): FilePreviewKind | null {
  for (const [pattern, kind] of EXTENSION_KINDS) {
    if (pattern.test(name)) return kind;
  }
  return null;
}

function isTextPreview(mime: string, name: string): boolean {
  return (
    mime.startsWith("text/") ||
    mime.includes("json") ||
    mime.includes("xml") ||
    TEXT_EXTENSION_RE.test(name)
  );
}

export function previewKindFor(
  mimeType: string,
  displayName: string,
): FilePreviewKind {
  const mime = mimeType.toLowerCase();
  const name = displayName.toLowerCase();
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";

  const mimeKind = EXACT_MIME_KINDS.get(mime);
  if (mimeKind !== undefined) return mimeKind;

  const extKind = extensionPreviewKind(name);
  if (extKind !== null) return extKind;

  return isTextPreview(mime, name) ? "text" : "file";
}
