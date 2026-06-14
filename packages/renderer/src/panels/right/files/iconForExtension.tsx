import type { LucideIcon } from "lucide-react";
import {
  File,
  FileArchive,
  FileAudio,
  FileCode,
  FileImage,
  FileJson,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Folder,
  FolderOpen,
} from "lucide-react";

const CODE = new Set([
  "ts", "tsx", "js", "jsx", "mjs", "cjs",
  "py", "go", "rs", "rb", "java", "c", "h", "cpp", "cc", "hpp",
  "cs", "php", "swift", "kt", "kts", "sh", "bash", "zsh", "fish",
  "lua", "dart", "scala", "ex", "exs", "clj", "cljs", "vue", "svelte",
]);
const TEXT = new Set(["md", "markdown", "txt", "rst", "log"]);
const STRUCTURED = new Set(["json", "jsonc", "yaml", "yml", "toml", "xml"]);
const IMAGE = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "svg", "ico", "bmp", "tiff", "avif",
]);
const VIDEO = new Set(["mp4", "mov", "webm", "mkv", "avi", "m4v"]);
const AUDIO = new Set(["mp3", "wav", "flac", "ogg", "m4a", "opus"]);
const SPREADSHEET = new Set(["csv", "tsv", "xls", "xlsx", "ods"]);
const ARCHIVE = new Set(["zip", "tar", "gz", "tgz", "bz2", "7z", "rar", "xz"]);

export interface IconChoice {
  Icon: LucideIcon;
  /* CSS modifier class for icon color. Lets the stylesheet tint by
     category (code / json / image / …) without the component touching
     hex colors. Folders return an empty string so they inherit the
     row's color (folders are already visually distinct by chevron). */
  colorClass: string;
}

export function iconForExtension(
  ext: string | null,
  isDir: boolean,
  isOpen: boolean,
): IconChoice {
  if (isDir) {
    return { Icon: isOpen ? FolderOpen : Folder, colorClass: "" };
  }
  if (ext === null) return { Icon: File, colorClass: "" };
  if (CODE.has(ext)) return { Icon: FileCode, colorClass: "icon-code" };
  if (TEXT.has(ext)) return { Icon: FileText, colorClass: "icon-text" };
  if (STRUCTURED.has(ext)) return { Icon: FileJson, colorClass: "icon-json" };
  if (IMAGE.has(ext)) return { Icon: FileImage, colorClass: "icon-image" };
  if (VIDEO.has(ext)) return { Icon: FileVideo, colorClass: "icon-video" };
  if (AUDIO.has(ext)) return { Icon: FileAudio, colorClass: "icon-audio" };
  if (SPREADSHEET.has(ext)) {
    return { Icon: FileSpreadsheet, colorClass: "icon-spreadsheet" };
  }
  if (ARCHIVE.has(ext)) {
    return { Icon: FileArchive, colorClass: "icon-archive" };
  }
  return { Icon: File, colorClass: "" };
}
