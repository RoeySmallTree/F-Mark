import { useEffect, useMemo, useRef, useState, type JSX } from "react";
import { FileText } from "lucide-react";
import Papa from "papaparse";
import type { FilePreviewKind } from "@f-mark/shared";
const NO_LOOSE_STRING_VALUES = {
  xlsx: "xlsx",
  array: "array",
  image: "image",
  video: "video",
  audio: "audio",
  text: "text",
  pdf: "pdf",
  csv: "csv",
  docx: "docx",
  pptx: "pptx",
  metadata: "metadata",
} as const;

/* mammoth (~400 KB) and xlsx (~600 KB) are loaded dynamically inside
   their respective preview effects. Only the type is imported eagerly
   (erased at build time). */
import type { WorkBook } from "xlsx";
import { useFileText } from "./useFileText.js";

interface FilePreviewProps {
  kind: FilePreviewKind;
  url: string;
  name: string;
}

function TextPreview({ url }: { url: string }): JSX.Element {
  const { text, error } = useFileText(url);
  if (error !== null) return <div className="file-preview-note">{error}</div>;
  if (text === null) return <div className="file-preview-note">Loading text…</div>;
  return <pre className="file-text-preview">{text}</pre>;
}

function CsvPreview({ url }: { url: string }): JSX.Element {
  const { text, error } = useFileText(url);
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

function VideoPreview({ url, name }: { url: string; name: string }): JSX.Element {
  return (
    <video
      className="file-video-preview"
      controls
      preload={NO_LOOSE_STRING_VALUES.metadata}
      src={url}
      aria-label={name}
    />
  );
}

function AudioPreview({ url, name }: { url: string; name: string }): JSX.Element {
  return <audio className="file-audio-preview" controls src={url} aria-label={name} />;
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
        const nextBook = xlsxMod.read(arrayBuffer, { type: NO_LOOSE_STRING_VALUES.array });
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
  const rows =
    sheet === undefined
      ? []
      : xlsxRef.current.utils.sheet_to_json<string[]>(sheet, {
          header: 1,
          blankrows: false,
        });
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

export function FilePreview({
  kind,
  url,
  name,
}: FilePreviewProps): JSX.Element {
  if (kind === NO_LOOSE_STRING_VALUES.image) {
    return <img className="file-image-preview" src={url} alt={name} />;
  }
  if (kind === NO_LOOSE_STRING_VALUES.video) return <VideoPreview url={url} name={name} />;
  if (kind === NO_LOOSE_STRING_VALUES.audio) return <AudioPreview url={url} name={name} />;
  if (kind === NO_LOOSE_STRING_VALUES.text) return <TextPreview url={url} />;
  if (kind === NO_LOOSE_STRING_VALUES.pdf) return <PdfPreview url={url} name={name} />;
  if (kind === NO_LOOSE_STRING_VALUES.csv) return <CsvPreview url={url} />;
  if (kind === NO_LOOSE_STRING_VALUES.docx) return <DocxPreview url={url} />;
  if (kind === NO_LOOSE_STRING_VALUES.xlsx) return <XlsxPreview url={url} />;
  if (kind === NO_LOOSE_STRING_VALUES.pptx) return <PptxPreview url={url} />;
  return (
    <div className="file-preview-empty">
      <FileText size={22} aria-hidden />
      <span>No inline preview for this file type.</span>
    </div>
  );
}
