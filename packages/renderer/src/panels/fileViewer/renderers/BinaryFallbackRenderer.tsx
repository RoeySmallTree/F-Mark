import { useEffect, useMemo, useState } from "react";
import { Download, File } from "lucide-react";
import { createClient } from "../../../api/client.js";
import { useStore } from "../../../state/store.js";
import { useScopedFile } from "../fileScope.js";
import { basenameOf } from "./pickRenderer.js";

const NO_LOOSE_STRING_VALUES = {
  bytes00: "bytes=0-0",
} as const;

export interface BinaryFallbackRendererProps {
  path: string;
}

function shortBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function BinaryFallbackRenderer({
  path,
}: BinaryFallbackRendererProps): JSX.Element {
  const token = useStore((s) => s.token);
  const client = useMemo(
    () => createClient({ baseUrl: "", token }),
    [token],
  );
  const scoped = useScopedFile(path);
  const url =
    scoped !== null ? client.fileContentUrl(scoped.scope, scoped.relPath) : "";

  /* HEAD probe so we can show the size; falls back to an unknown-size
     card if the HEAD fails (server doesn't currently respond to HEAD,
     but the GET response headers carry Content-Length too). */
  const [size, setSize] = useState<number | null>(null);
  useEffect(() => {
    if (url.length === 0) return;
    let cancelled = false;
    fetch(url, { method: "GET", headers: { Range: NO_LOOSE_STRING_VALUES.bytes00 } })
      .then((res) => {
        if (cancelled) return;
        const cr = res.headers.get("content-range");
        if (cr !== null) {
          const total = Number.parseInt(cr.split("/")[1] ?? "", 10);
          if (!Number.isNaN(total)) {
            setSize(total);
            return;
          }
        }
        const cl = res.headers.get("content-length");
        if (cl !== null) {
          const n = Number.parseInt(cl, 10);
          if (!Number.isNaN(n)) setSize(n);
        }
      })
      .catch(() => {
        /* swallow — keep size null */
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (scoped === null) {
    return <div className="fv-error">file is outside the project root</div>;
  }

  return (
    <div className="fv-binary">
      <File size={48} aria-hidden className="fv-binary-icon" />
      <div className="fv-binary-name">{basenameOf(path)}</div>
      <div className="fv-binary-meta">
        {size !== null ? shortBytes(size) : "size unknown"} · binary file
      </div>
      <a
        className="fv-binary-download"
        href={url}
        download={basenameOf(path)}
      >
        <Download size={13} aria-hidden /> Download
      </a>
    </div>
  );
}
