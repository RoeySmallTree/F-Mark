import {
  FILE_PREVIEW_KINDS,
  type FilePreviewKind,
  type FileRefPayload,
} from "@f-mark/shared";
import { displayName } from "./names.js";

const mimePrefixes = {
  image: "image/",
  video: "video/",
  audio: "audio/",
  text: "text/",
} as const;

const mimeTypes = {
  pdf: "application/pdf",
  csv: "text/csv",
} as const;

const mimeTokens = {
  json: "json",
  xml: "xml",
  javascript: "javascript",
  typescript: "typescript",
} as const;

const fileExtensions = {
  pdf: ".pdf",
  csv: ".csv",
  docx: ".docx",
  xlsx: ".xlsx",
  xls: ".xls",
  pptx: ".pptx",
  ppt: ".ppt",
} as const;

const IMAGE_EXTENSION_RE = /\.(png|jpe?g|gif|webp|svg|ico|bmp|tiff?|avif)$/i;
const VIDEO_EXTENSION_RE = /\.(mp4|m4v|webm|mov|mkv|avi|ogv)$/i;
const AUDIO_EXTENSION_RE = /\.(mp3|wav|ogg|oga|flac|m4a|opus|aac)$/i;
const TEXT_EXTENSION_RE =
  /\.(mdx?|markdown|txt|log|jsonc?|xml|ya?ml|toml|html?|css|s[ac]ss|less|[cm]?[jt]sx?|ts|tsx|jsx|py|go|rs|rb|java|c|h|cpp|cc|hpp|cs|php|swift|kts?|sh|bash|zsh|fish|lua|dart|scala|exs?|clj|cljs|vue|svelte|ini|conf|cfg|env|sql|graphql|gql|proto|dockerfile|makefile)$/i;

export function previewKind(payload: FileRefPayload): FilePreviewKind {
  if (payload.preview_kind !== undefined) return payload.preview_kind;
  const mime = payload.mime_type.toLowerCase();
  const name = displayName(payload).toLowerCase();
  if (mime.startsWith(mimePrefixes.image) || IMAGE_EXTENSION_RE.test(name)) {
    return FILE_PREVIEW_KINDS.image;
  }
  if (mime.startsWith(mimePrefixes.video) || VIDEO_EXTENSION_RE.test(name)) {
    return FILE_PREVIEW_KINDS.video;
  }
  if (mime.startsWith(mimePrefixes.audio) || AUDIO_EXTENSION_RE.test(name)) {
    return FILE_PREVIEW_KINDS.audio;
  }
  if (mime === mimeTypes.pdf || name.endsWith(fileExtensions.pdf)) {
    return FILE_PREVIEW_KINDS.pdf;
  }
  if (mime === mimeTypes.csv || name.endsWith(fileExtensions.csv)) {
    return FILE_PREVIEW_KINDS.csv;
  }
  if (name.endsWith(fileExtensions.docx)) return FILE_PREVIEW_KINDS.docx;
  if (
    name.endsWith(fileExtensions.xlsx) ||
    name.endsWith(fileExtensions.xls)
  ) {
    return FILE_PREVIEW_KINDS.xlsx;
  }
  if (
    name.endsWith(fileExtensions.pptx) ||
    name.endsWith(fileExtensions.ppt)
  ) {
    return FILE_PREVIEW_KINDS.pptx;
  }
  if (
    mime.startsWith(mimePrefixes.text) ||
    mime.includes(mimeTokens.json) ||
    mime.includes(mimeTokens.xml) ||
    mime.includes(mimeTokens.javascript) ||
    mime.includes(mimeTokens.typescript) ||
    TEXT_EXTENSION_RE.test(name)
  ) {
    return FILE_PREVIEW_KINDS.text;
  }
  return FILE_PREVIEW_KINDS.file;
}
