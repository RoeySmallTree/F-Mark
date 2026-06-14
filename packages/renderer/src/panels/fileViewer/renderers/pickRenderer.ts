/* Dispatch from file extension → renderer kind. Kept separate from the
   icon picker (iconForExtension.tsx) because the buckets diverge: a `.ts`
   file uses the same icon as `.py`, but they both render via Monaco —
   icon buckets are about "what does it look like" while renderer buckets
   are about "what code reads it". */

export type RendererKind =
  | "image"
  | "video"
  | "audio"
  | "markdown"
  | "csv"
  | "office-xlsx"
  | "office-docx"
  | "office-pptx"
  | "monaco"
  | "binary";

/* Extensions that should render via Monaco (text/code). */
const MONACO_EXTS = new Set([
  "ts", "tsx", "js", "jsx", "mjs", "cjs",
  "py", "go", "rs", "rb", "java", "c", "h", "cpp", "cc", "hpp",
  "cs", "php", "swift", "kt", "kts", "sh", "bash", "zsh", "fish",
  "lua", "dart", "scala", "ex", "exs", "clj", "cljs", "vue", "svelte",
  "json", "jsonc", "yaml", "yml", "toml", "xml",
  "html", "htm", "css", "scss", "sass", "less",
  "txt", "log", "rst", "ini", "conf", "cfg", "env",
  "sql", "graphql", "gql", "proto",
  "dockerfile", "makefile",
]);

const IMAGE_EXTS = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "svg", "ico", "bmp", "tiff", "avif",
]);
const VIDEO_EXTS = new Set(["mp4", "m4v", "webm", "mov", "mkv", "avi", "ogv"]);
const AUDIO_EXTS = new Set(["mp3", "wav", "ogg", "oga", "flac", "m4a", "opus", "aac"]);
const MARKDOWN_EXTS = new Set(["md", "markdown", "mdx"]);
const CSV_EXTS = new Set(["csv", "tsv"]);

/* Monaco knows these as language IDs. Anything outside the table falls
   back to "plaintext" which still renders text content correctly. */
const LANG_BY_EXT: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  py: "python",
  go: "go",
  rs: "rust",
  rb: "ruby",
  java: "java",
  c: "c",
  h: "c",
  cpp: "cpp",
  cc: "cpp",
  hpp: "cpp",
  cs: "csharp",
  php: "php",
  swift: "swift",
  kt: "kotlin",
  kts: "kotlin",
  sh: "shell",
  bash: "shell",
  zsh: "shell",
  fish: "shell",
  lua: "lua",
  dart: "dart",
  scala: "scala",
  json: "json",
  jsonc: "json",
  yaml: "yaml",
  yml: "yaml",
  toml: "ini",
  xml: "xml",
  html: "html",
  htm: "html",
  css: "css",
  scss: "scss",
  less: "less",
  txt: "plaintext",
  log: "plaintext",
  rst: "plaintext",
  ini: "ini",
  conf: "ini",
  cfg: "ini",
  env: "plaintext",
  sql: "sql",
  graphql: "graphql",
  gql: "graphql",
  proto: "plaintext",
  dockerfile: "dockerfile",
  makefile: "makefile",
  md: "markdown",
  markdown: "markdown",
};

export function pickRenderer(ext: string | null): RendererKind {
  if (ext === null) return "monaco"; /* dotfiles like .gitignore */
  const e = ext.toLowerCase();
  if (IMAGE_EXTS.has(e)) return "image";
  if (VIDEO_EXTS.has(e)) return "video";
  if (AUDIO_EXTS.has(e)) return "audio";
  if (MARKDOWN_EXTS.has(e)) return "markdown";
  if (CSV_EXTS.has(e)) return "csv";
  if (e === "xlsx" || e === "xls") return "office-xlsx";
  if (e === "docx") return "office-docx";
  if (e === "pptx" || e === "ppt") return "office-pptx";
  if (MONACO_EXTS.has(e)) return "monaco";
  return "binary";
}

export function monacoLanguage(ext: string | null): string {
  if (ext === null) return "plaintext";
  return LANG_BY_EXT[ext.toLowerCase()] ?? "plaintext";
}

export function extOf(absPath: string): string | null {
  const slash = absPath.lastIndexOf("/");
  const name = slash >= 0 ? absPath.slice(slash + 1) : absPath;
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) return null;
  return name.slice(dot + 1).toLowerCase();
}

export function basenameOf(absPath: string): string {
  const slash = absPath.lastIndexOf("/");
  return slash >= 0 ? absPath.slice(slash + 1) : absPath;
}
