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

const NO_LOOSE_STRING_VALUES = {
  iconCode: "icon-code",
  iconText: "icon-text",
  iconJson: "icon-json",
  iconImage: "icon-image",
  iconVideo: "icon-video",
  iconAudio: "icon-audio",
  iconSpreadsheet: "icon-spreadsheet",
  iconArchive: "icon-archive",
} as const;

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
  if (CODE.has(ext)) return { Icon: FileCode, colorClass: NO_LOOSE_STRING_VALUES.iconCode };
  if (TEXT.has(ext)) return { Icon: FileText, colorClass: NO_LOOSE_STRING_VALUES.iconText };
  if (STRUCTURED.has(ext)) return { Icon: FileJson, colorClass: NO_LOOSE_STRING_VALUES.iconJson };
  if (IMAGE.has(ext)) return { Icon: FileImage, colorClass: NO_LOOSE_STRING_VALUES.iconImage };
  if (VIDEO.has(ext)) return { Icon: FileVideo, colorClass: NO_LOOSE_STRING_VALUES.iconVideo };
  if (AUDIO.has(ext)) return { Icon: FileAudio, colorClass: NO_LOOSE_STRING_VALUES.iconAudio };
  if (SPREADSHEET.has(ext)) {
    return { Icon: FileSpreadsheet, colorClass: NO_LOOSE_STRING_VALUES.iconSpreadsheet };
  }
  if (ARCHIVE.has(ext)) {
    return { Icon: FileArchive, colorClass: NO_LOOSE_STRING_VALUES.iconArchive };
  }
  return { Icon: File, colorClass: "" };
}
