import { useEffect, useMemo, useRef, useState, type JSX } from "react";
import { Download, FileText, MessageSquare, Pencil, Save, X } from "lucide-react";
import Papa from "papaparse";
/* mammoth (~400 KB) and xlsx (~600 KB) are loaded dynamically inside
   their respective preview effects — same pattern as pptx-preview below.
   Only the type is imported eagerly (erased at build time). */
import type { WorkBook } from "xlsx";
import type {
  AnyEventRecord,
  FilePreviewKind,
  FileRefPayload,
  Participant,
} from "@f-mark/shared";
import { createClient } from "../api/client.js";
import { useStore } from "../state/store.js";
import { formatWhen, whoOf } from "./format.js";
import { ParticipantAvatar } from "../components/ParticipantAvatar.js";

interface Props {
  event: AnyEventRecord;
  participants: Record<string, Participant>;
  comments?: AnyEventRecord[];
}

function displayName(payload: FileRefPayload): string {
  return payload.display_name ?? payload.path.split("/").pop() ?? payload.path;
}

function shortBytes(bytes: number | undefined): string | null {
  if (bytes === undefined) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function encodePath(path: string): string {
  return path.split("/").map((part) => encodeURIComponent(part)).join("/");
}

function withToken(href: string, token: string | null): string {
  if (token === null || token.length === 0) return href;
  const sep = href.includes("?") ? "&" : "?";
  return `${href}${sep}token=${encodeURIComponent(token)}`;
}

function hrefFor(
  sessionId: string | null,
  payload: FileRefPayload,
  token: string | null,
): string {
  if (sessionId === null) return "#";
  const base =
    payload.schema === "fmark.file.v1" || payload.path.startsWith("attachments/")
      ? `/sessions/${encodeURIComponent(sessionId)}/attachments/${encodeURIComponent(payload.id)}/content`
      : `/sessions/${encodeURIComponent(sessionId)}/raw/${encodePath(payload.path)}`;
  return withToken(base, token);
}

function previewKind(payload: FileRefPayload): FilePreviewKind {
  if (payload.preview_kind !== undefined) return payload.preview_kind;
  const mime = payload.mime_type.toLowerCase();
  const name = displayName(payload).toLowerCase();
  if (mime.startsWith("image/")) return "image";
  if (mime === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (mime === "text/csv" || name.endsWith(".csv")) return "csv";
  if (name.endsWith(".docx")) return "docx";
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) return "xlsx";
  if (name.endsWith(".pptx") || name.endsWith(".ppt")) return "pptx";
  if (
    mime.startsWith("text/") ||
    mime.includes("json") ||
    mime.includes("xml") ||
    /\.(md|markdown|txt|log|json|xml|ya?ml)$/.test(name)
  ) {
    return "text";
  }
  return "file";
}

function useText(url: string): { text: string | null; error: string | null } {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (url === "#") return;
    let cancelled = false;
    setText(null);
    setError(null);
    void (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = await res.text();
        if (!cancelled) setText(body);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);
  return { text, error };
}

function TextPreview({ url }: { url: string }): JSX.Element {
  const { text, error } = useText(url);
  if (error !== null) return <div className="file-preview-note">{error}</div>;
  if (text === null) return <div className="file-preview-note">Loading text…</div>;
  return <pre className="file-text-preview">{text}</pre>;
}

function CsvPreview({ url }: { url: string }): JSX.Element {
  const { text, error } = useText(url);
  const rows = useMemo(() => {
    if (text === null) return null;
    const parsed = Papa.parse<string[]>(text, {
      skipEmptyLines: true,
    });
    return parsed.data.filter((row) => row.length > 0);
  }, [text]);
  if (error !== null) return <div className="file-preview-note">{error}</div>;
  if (rows === null) return <div className="file-preview-note">Loading CSV…</div>;
  if (rows.length === 0) return <div className="file-preview-note">Empty CSV</div>;
  const [head, ...body] = rows;
  return (
    <div className="file-table-wrap">
      <table className="file-table">
        <thead>
          <tr>
            {head!.map((cell, i) => (
              <th key={`${i}:${cell}`}>{cell}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.slice(0, 200).map((row, r) => (
            <tr key={r}>
              {head!.map((_, c) => (
                <td key={c}>{row[c] ?? ""}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {body.length > 200 ? (
        <div className="file-preview-note">Showing first 200 rows.</div>
      ) : null}
    </div>
  );
}

function PdfPreview({ url, name }: { url: string; name: string }): JSX.Element {
  return <iframe className="file-pdf-preview" src={url} title={name} />;
}

function DocxPreview({ url }: { url: string }): JSX.Element {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (url === "#") return;
    let cancelled = false;
    setHtml(null);
    setError(null);
    void (async () => {
      try {
        const [mammothMod, res] = await Promise.all([
          import("mammoth"),
          fetch(url),
        ]);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const arrayBuffer = await res.arrayBuffer();
        const result = await mammothMod.default.convertToHtml({ arrayBuffer });
        if (!cancelled) setHtml(result.value);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);
  if (error !== null) return <div className="file-preview-note">{error}</div>;
  if (html === null) return <div className="file-preview-note">Loading DOCX…</div>;
  return (
    <div
      className="file-docx-preview"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function XlsxPreview({ url }: { url: string }): JSX.Element {
  const [book, setBook] = useState<WorkBook | null>(null);
  const [sheetName, setSheetName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /* xlsx is dynamically loaded, but `sheet_to_json` is called below during
     render to derive `rows`. Stash the imported module so the render pass
     can use it once the workbook is ready. */
  const xlsxRef = useRef<typeof import("xlsx") | null>(null);
  useEffect(() => {
    if (url === "#") return;
    let cancelled = false;
    setBook(null);
    setSheetName(null);
    setError(null);
    void (async () => {
      try {
        const [xlsxMod, res] = await Promise.all([
          import("xlsx"),
          fetch(url),
        ]);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const arrayBuffer = await res.arrayBuffer();
        const nextBook = xlsxMod.read(arrayBuffer, { type: "array" });
        if (!cancelled) {
          xlsxRef.current = xlsxMod;
          setBook(nextBook);
          setSheetName(nextBook.SheetNames[0] ?? null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);
  if (error !== null) return <div className="file-preview-note">{error}</div>;
  if (book === null || sheetName === null || xlsxRef.current === null) {
    return <div className="file-preview-note">Loading workbook…</div>;
  }
  const sheet = book.Sheets[sheetName];
  const rows = sheet === undefined
    ? []
    : xlsxRef.current.utils.sheet_to_json<string[]>(sheet, { header: 1, blankrows: false });
  return (
    <div>
      <div className="file-sheet-tabs" role="tablist" aria-label="Sheets">
        {book.SheetNames.map((name) => (
          <button
            key={name}
            type="button"
            className={name === sheetName ? "active" : ""}
            onClick={() => setSheetName(name)}
          >
            {name}
          </button>
        ))}
      </div>
      <div className="file-table-wrap">
        <table className="file-table">
          <tbody>
            {rows.slice(0, 200).map((row, r) => (
              <tr key={r}>
                {row.map((cell, c) => (
                  <td key={c}>{String(cell ?? "")}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length > 200 ? (
          <div className="file-preview-note">Showing first 200 rows.</div>
        ) : null}
      </div>
    </div>
  );
}

function PptxPreview({ url }: { url: string }): JSX.Element {
  const ref = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (url === "#" || ref.current === null) return;
    let cancelled = false;
    const target = ref.current;
    target.innerHTML = "";
    setError(null);
    void (async () => {
      try {
        const [{ init }, res] = await Promise.all([import("pptx-preview"), fetch(url)]);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buffer = await res.arrayBuffer();
        if (cancelled) return;
        const previewer = init(target, { width: 960, height: 540 });
        await previewer.preview(buffer);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
      target.innerHTML = "";
    };
  }, [url]);
  return (
    <div>
      {error !== null ? <div className="file-preview-note">{error}</div> : null}
      <div ref={ref} className="file-pptx-preview" />
    </div>
  );
}

function FilePreview({
  kind,
  url,
  name,
}: {
  kind: FilePreviewKind;
  url: string;
  name: string;
}): JSX.Element {
  if (kind === "image") {
    return <img className="file-image-preview" src={url} alt={name} />;
  }
  if (kind === "text") return <TextPreview url={url} />;
  if (kind === "pdf") return <PdfPreview url={url} name={name} />;
  if (kind === "csv") return <CsvPreview url={url} />;
  if (kind === "docx") return <DocxPreview url={url} />;
  if (kind === "xlsx") return <XlsxPreview url={url} />;
  if (kind === "pptx") return <PptxPreview url={url} />;
  return (
    <div className="file-preview-empty">
      <FileText size={22} aria-hidden />
      <span>No inline preview for this file type.</span>
    </div>
  );
}

export function FileCard({
  event,
  participants,
  comments = [],
}: Props): JSX.Element {
  const payload = event.payload as FileRefPayload;
  const who = whoOf(event.participant_id, participants);
  const sessionId = useStore((s) => s.currentSessionId);
  const currentUserId = useStore((s) => s.currentUserId);
  const token = useStore((s) => s.token);
  const setCommentTarget = useStore((s) => s.setCommentTarget);
  const commentTarget = useStore((s) => s.commentTarget);
  const upsertEvent = useStore((s) => s.upsertEvent);
  const name = displayName(payload);
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState(name);
  const [savingName, setSavingName] = useState(false);
  const [nameOverride, setNameOverride] = useState<string | null>(null);
  const effectiveName = nameOverride ?? name;
  const href = hrefFor(sessionId, payload, token);
  const kind = previewKind(payload);
  const isFocused =
    commentTarget !== null &&
    commentTarget.kind === "event" &&
    commentTarget.file === event.filename;
  const canRename =
    sessionId !== null &&
    currentUserId !== null &&
    (payload.schema === "fmark.file.v1" || payload.path.startsWith("attachments/"));

  useEffect(() => {
    setDraftName(effectiveName);
  }, [effectiveName]);

  async function rename(): Promise<void> {
    if (!canRename || sessionId === null || currentUserId === null) return;
    const nextName = draftName.trim();
    if (nextName.length === 0 || nextName === effectiveName) {
      setRenaming(false);
      return;
    }
    setSavingName(true);
    try {
      const client = createClient({ baseUrl: "", token });
      // TODO(file-attachment-rename): client.renameAttachment not yet
      // implemented end-to-end; user WIP. Optimistic local rename only.
      void client;
      void payload;
      void currentUserId;
      setNameOverride(nextName);
      setRenaming(false);
    } finally {
      setSavingName(false);
    }
  }

  return (
    <div data-event-kind="file">
      <div className="card-head" style={{ paddingLeft: 0, marginBottom: 8 }}>
        <ParticipantAvatar
          participantId={who.id}
          kind={who.isUser ? "user" : "agent"}
          name={who.name}
          color={who.color}
          runtimeId={who.runtimeId}
          size="sm"
        />
        <span className="who">{who.name}</span>
        <span className="when">{formatWhen(event.timestamp)}</span>
        <span className="badge">
          <FileText size={10} aria-hidden /> FILE
        </span>
      </div>
      <article className={`file-card${isFocused ? " focused" : ""}`}>
        <header className="file-card-head">
          <div className="file-icon" aria-hidden>
            <FileText size={18} />
          </div>
          <div className="file-title">
            {renaming ? (
              <input
                value={draftName}
                onChange={(e) => setDraftName(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void rename();
                  if (e.key === "Escape") setRenaming(false);
                }}
                aria-label="Rename file"
                autoFocus
              />
            ) : (
              <div className="file-name">{effectiveName}</div>
            )}
            <div className="file-meta">
              {payload.mime_type}
              {shortBytes(payload.size_bytes) !== null
                ? ` · ${shortBytes(payload.size_bytes)}`
                : ""}
              {comments.length > 0 ? ` · ${comments.length} comment${comments.length === 1 ? "" : "s"}` : ""}
            </div>
            {payload.description !== undefined && payload.description.length > 0 && (
              <div className="file-desc">"{payload.description}"</div>
            )}
          </div>
          <div className="file-actions">
            {renaming ? (
              <>
                <button
                  type="button"
                  onClick={() => void rename()}
                  disabled={savingName}
                  aria-label="Save file name"
                  title="Save file name"
                >
                  <Save size={13} aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => setRenaming(false)}
                  aria-label="Cancel rename"
                  title="Cancel rename"
                >
                  <X size={13} aria-hidden />
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setDraftName(effectiveName);
                    setRenaming(true);
                  }}
                  disabled={!canRename}
                  aria-label="Rename file"
                  title="Rename file"
                >
                  <Pencil size={13} aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setCommentTarget({ kind: "event", file: event.filename })
                  }
                  aria-label="Comment on file"
                  title="Comment on file"
                >
                  <MessageSquare size={13} aria-hidden />
                </button>
                <a href={href} download={effectiveName} aria-label="Download file" title="Download file">
                  <Download size={13} aria-hidden />
                </a>
              </>
            )}
          </div>
        </header>
        <div className="file-preview">
          <FilePreview kind={kind} url={href} name={effectiveName} />
        </div>
      </article>
    </div>
  );
}
