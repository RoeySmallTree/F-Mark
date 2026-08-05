import { useEffect, useMemo, useRef, useState } from "react";
import type { WorkBook } from "xlsx";
import { createClient } from "../../../api/client.js";
import { useStore } from "../../../state/store.js";
import { useScopedFile } from "../fileScope.js";
import { FvLoading } from "../FileViewerLoading.js";
import { useRovingTabIndex } from "../../../a11y/useRovingTabIndex.js";

const NO_LOOSE_STRING_VALUES = {
  xlsx: "xlsx",
  docx: "docx",
  array: "array",
} as const;

/* Wraps the three office viewers. They follow the same dynamic-import +
   fetch pattern that FileCard uses for compose-attachment previews —
   duplicated here because the FileCard variants are tightly coupled to
   that card's chrome. If divergence stays small we can DRY this later. */

export interface OfficeRendererProps {
  path: string;
  kind: "xlsx" | "docx" | "pptx";
}

export function OfficeRenderer({
  path,
  kind,
}: OfficeRendererProps): JSX.Element {
  const token = useStore((s) => s.token);
  const client = useMemo(() => createClient({ baseUrl: "", token }), [token]);
  const scoped = useScopedFile(path);
  if (scoped === null) {
    return <div className="fv-error">file is outside the project root</div>;
  }
  const url = client.fileContentUrl(scoped.scope, scoped.relPath);

  if (kind === NO_LOOSE_STRING_VALUES.xlsx) return <XlsxView url={url} />;
  if (kind === NO_LOOSE_STRING_VALUES.docx) return <DocxView url={url} />;
  return <PptxView url={url} />;
}

function XlsxSheetTabs({
  sheetNames,
  sheetName,
  onSelect,
}: {
  sheetNames: string[];
  sheetName: string;
  onSelect: (name: string) => void;
}): JSX.Element {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const activeIndex = Math.max(sheetNames.indexOf(sheetName), 0);
  const { tabIndexFor, onKeyDown } = useRovingTabIndex(
    sheetNames.length,
    activeIndex,
    (index) => {
      const name = sheetNames[index];
      if (name === undefined) return;
      onSelect(name);
      tabRefs.current[index]?.focus();
    },
  );
  return (
    <div
      className="file-sheet-tabs"
      role="tablist"
      aria-label="Sheets"
      onKeyDown={onKeyDown}
    >
      {sheetNames.map((name, index) => (
        <button
          key={name}
          ref={(el) => {
            tabRefs.current[index] = el;
          }}
          type="button"
          role="tab"
          aria-selected={name === sheetName}
          tabIndex={tabIndexFor(index)}
          className={name === sheetName ? "active" : ""}
          onClick={() => onSelect(name)}
        >
          {name}
        </button>
      ))}
    </div>
  );
}

function DocxView({ url }: { url: string }): JSX.Element {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
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
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);
  if (error !== null) return <div className="fv-error">{error}</div>;
  if (html === null) return <FvLoading />;
  return (
    <div
      className="file-docx-preview"
      style={{ padding: 20 }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function XlsxView({ url }: { url: string }): JSX.Element {
  const [book, setBook] = useState<WorkBook | null>(null);
  const [sheetName, setSheetName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const xlsxRef = useRef<typeof import("xlsx") | null>(null);
  useEffect(() => {
    let cancelled = false;
    setBook(null);
    setSheetName(null);
    setError(null);
    void (async () => {
      try {
        const [xlsxMod, res] = await Promise.all([import("xlsx"), fetch(url)]);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const arrayBuffer = await res.arrayBuffer();
        const next = xlsxMod.read(arrayBuffer, {
          type: NO_LOOSE_STRING_VALUES.array,
        });
        if (!cancelled) {
          xlsxRef.current = xlsxMod;
          setBook(next);
          setSheetName(next.SheetNames[0] ?? null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);
  if (error !== null) return <div className="fv-error">{error}</div>;
  if (book === null || sheetName === null || xlsxRef.current === null) {
    return <FvLoading />;
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
    <div className="fv-csv-table-wrap">
      <XlsxSheetTabs
        sheetNames={book.SheetNames}
        sheetName={sheetName}
        onSelect={setSheetName}
      />
      <table className="fv-csv-table">
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
        <div className="fv-loading">
          showing first 200 of {rows.length} rows
        </div>
      ) : null}
    </div>
  );
}

function PptxView({ url }: { url: string }): JSX.Element {
  const ref = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (ref.current === null) return;
    let cancelled = false;
    const target = ref.current;
    target.innerHTML = "";
    setError(null);
    void (async () => {
      try {
        const [{ init }, res] = await Promise.all([
          import("pptx-preview"),
          fetch(url),
        ]);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buffer = await res.arrayBuffer();
        if (cancelled) return;
        const previewer = init(target, { width: 960, height: 540 });
        await previewer.preview(buffer);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    })();
    return () => {
      cancelled = true;
      target.innerHTML = "";
    };
  }, [url]);
  return (
    <div style={{ padding: 20 }}>
      {error !== null ? <div className="fv-error">{error}</div> : null}
      <div ref={ref} className="file-pptx-preview" />
    </div>
  );
}
