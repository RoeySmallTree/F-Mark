import { AlertTriangle, FileText } from "lucide-react";
import { useRef, useState, type JSX, type ReactNode } from "react";
import { useStore } from "../state/store.js";

export interface FileReference {
  path: string;
  label?: string;
  line?: number;
}

export interface MetaItem {
  label: string;
  value: ReactNode;
}

export interface StructuredError {
  title: string;
  message?: string;
  details?: unknown;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseJsonString(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (
    (!trimmed.startsWith("{") || !trimmed.endsWith("}")) &&
    (!trimmed.startsWith("[") || !trimmed.endsWith("]"))
  ) {
    return value;
  }
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return value;
  }
}

export function stringifyForDisplay(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function firstString(
  record: Record<string, unknown> | null | undefined,
  keys: string[],
): string | undefined {
  if (record === null || record === undefined) return undefined;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) return value;
  }
  return undefined;
}

export function firstNumber(
  record: Record<string, unknown> | null | undefined,
  keys: string[],
): number | undefined {
  if (record === null || record === undefined) return undefined;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return undefined;
}

function basename(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts.at(-1) ?? path;
}

function relPath(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts.slice(Math.max(0, parts.length - 3)).join("/");
}

function toOpenablePath(path: string, activePath: string | null): string {
  if (path.startsWith("/")) return path;
  if (activePath === null || activePath.length === 0) return path;
  return `${activePath.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

export function ToolFileReference({ file }: { file: FileReference }): JSX.Element {
  const activePath = useStore((s) => s.activePath);
  const openFile = useStore((s) => s.openFile);
  const openPath = toOpenablePath(file.path, activePath);
  const title = file.line !== undefined ? `${file.path}:${file.line}` : file.path;

  return (
    <button
      type="button"
      className="tool-file-ref"
      title={title}
      onClick={() => openFile(openPath)}
    >
      <FileText size={13} aria-hidden="true" />
      <span className="tool-file-ref-name">{file.label ?? basename(file.path)}</span>
      <span className="tool-file-ref-path">{relPath(file.path)}</span>
      {file.line !== undefined ? (
        <span className="tool-file-ref-line">L{file.line}</span>
      ) : null}
    </button>
  );
}

export function ToolMeta({ items }: { items: MetaItem[] }): JSX.Element | null {
  const visible = items.filter(
    (item) => item.value !== undefined && item.value !== null && item.value !== "",
  );
  if (visible.length === 0) return null;
  return (
    <div className="tool-meta">
      {visible.map((item) => (
        <span key={item.label}>
          <b>{item.label}</b> {item.value}
        </span>
      ))}
    </div>
  );
}

export function CodeBlock({
  children,
  label,
}: {
  children: string;
  label?: string;
}): JSX.Element {
  // Reference `.io` vocabulary: a mono output box, optionally with its own label
  // (in tool sections the parent `.io-label` already names it, so callers omit it).
  if (label !== undefined) {
    return (
      <div className="io">
        <div className="io-label">{label}</div>
        <pre className="io-raw">{children}</pre>
      </div>
    );
  }
  return <pre className="io-raw">{children}</pre>;
}

export function CodeExcerpt({
  content,
  startLine = 1,
  maxLines = 80,
}: {
  content: string;
  startLine?: number;
  maxLines?: number;
}): JSX.Element {
  const lines = content.split(/\r?\n/);
  const shown = lines.slice(0, maxLines);
  const truncated = lines.length > shown.length;
  return (
    <div className="tool-excerpt">
      {shown.map((line, index) => (
        <div className="tool-excerpt-row" key={`${index}-${line}`}>
          <span className="tool-excerpt-line">{startLine + index}</span>
          <code>{line.length > 0 ? line : " "}</code>
        </div>
      ))}
      {truncated ? (
        <div className="tool-excerpt-more">
          {lines.length - shown.length} more lines hidden
        </div>
      ) : null}
    </div>
  );
}

function splitLines(text: string): string[] {
  const lines = text.split(/\r?\n/);
  return lines.length === 1 && lines[0] === "" ? [""] : lines;
}

export function ToolDiff({
  oldText,
  newText,
  title,
}: {
  oldText: string;
  newText: string;
  title?: string;
}): JSX.Element {
  const [mode, setMode] = useState<"inline" | "side-by-side">("inline");
  const beforePaneRef = useRef<HTMLDivElement | null>(null);
  const afterPaneRef = useRef<HTMLDivElement | null>(null);
  const oldLines = splitLines(oldText);
  const newLines = splitLines(newText);

  function syncSideScroll(
    source: HTMLDivElement | null,
    target: HTMLDivElement | null,
  ): void {
    if (source === null || target === null) return;
    if (target.scrollTop !== source.scrollTop) target.scrollTop = source.scrollTop;
    if (target.scrollLeft !== source.scrollLeft) {
      target.scrollLeft = source.scrollLeft;
    }
  }

  return (
    <div className="diff" data-testid="tool-diff">
      <div className="diff-head">
        <span className="diff-file">{title ?? "Changes"}</span>
        <span className="diff-stats">
          <span className="a">+{newLines.length}</span>
          <span className="d">&minus;{oldLines.length}</span>
        </span>
        <div className="diff-mode-toggle" role="group" aria-label="Diff display mode">
          <button
            type="button"
            aria-pressed={mode === "inline"}
            onClick={() => setMode("inline")}
          >
            Inline
          </button>
          <button
            type="button"
            aria-pressed={mode === "side-by-side"}
            onClick={() => setMode("side-by-side")}
          >
            Side by side
          </button>
        </div>
      </div>
      {mode === "inline" ? (
        <div className="diff-body" data-testid="tool-diff-inline">
          {oldLines.map((line, index) => (
            <div className="diff-line del" key={`old-${index}-${line}`}>
              <span className="diff-gutter">{index + 1}</span>
              <span className="diff-gutter" />
              <span className="diff-code">{line.length > 0 ? line : " "}</span>
            </div>
          ))}
          {newLines.map((line, index) => (
            <div className="diff-line add" key={`new-${index}-${line}`}>
              <span className="diff-gutter" />
              <span className="diff-gutter">{index + 1}</span>
              <span className="diff-code">{line.length > 0 ? line : " "}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="diff-body diff-split" data-testid="tool-diff-split">
          <div
            className="diff-pane before"
            data-testid="tool-diff-before-pane"
            ref={beforePaneRef}
            onScroll={() => syncSideScroll(beforePaneRef.current, afterPaneRef.current)}
          >
            <div className="diff-pane-title">Before</div>
            {oldLines.map((line, index) => (
              <div className="diff-pane-row" key={`before-${index}-${line}`}>
                <span className="diff-gutter">{index + 1}</span>
                <span className="diff-code">{line.length > 0 ? line : " "}</span>
              </div>
            ))}
          </div>
          <div
            className="diff-pane after"
            data-testid="tool-diff-after-pane"
            ref={afterPaneRef}
            onScroll={() => syncSideScroll(afterPaneRef.current, beforePaneRef.current)}
          >
            <div className="diff-pane-title">After</div>
            {newLines.map((line, index) => (
              <div className="diff-pane-row" key={`after-${index}-${line}`}>
                <span className="diff-gutter">{index + 1}</span>
                <span className="diff-code">{line.length > 0 ? line : " "}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function RawDetails({
  label = "Raw details",
  value,
}: {
  label?: string;
  value: unknown;
}): JSX.Element {
  return (
    <details className="tool-raw-details">
      <summary>{label}</summary>
      <pre>{stringifyForDisplay(value)}</pre>
    </details>
  );
}

export function ErrorNotice({ error }: { error: StructuredError }): JSX.Element {
  return (
    <div className="tool-error-notice" role="status">
      <AlertTriangle size={14} aria-hidden="true" />
      <div>
        <b>{error.title}</b>
        {error.message !== undefined ? <p>{error.message}</p> : null}
        {error.details !== undefined ? (
          <RawDetails label="Technical details" value={error.details} />
        ) : null}
      </div>
    </div>
  );
}
