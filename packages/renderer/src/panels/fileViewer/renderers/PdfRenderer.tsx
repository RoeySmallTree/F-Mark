import { useMemo } from "react";
import { createClient } from "../../../api/client.js";
import { useStore } from "../../../state/store.js";
import { useScopedFile } from "../fileScope.js";
import { basenameOf } from "./pickRenderer.js";

export interface PdfRendererProps {
  path: string;
}

export function PdfRenderer({ path }: PdfRendererProps): JSX.Element {
  const token = useStore((s) => s.token);
  const client = useMemo(
    () => createClient({ baseUrl: "", token }),
    [token],
  );
  const scoped = useScopedFile(path);
  if (scoped === null) {
    return <div className="fv-error">file is outside the project root</div>;
  }
  const url = client.fileContentUrl(scoped.scope, scoped.relPath);
  return (
    <iframe
      className="fv-pdf-frame"
      src={url}
      title={basenameOf(path)}
    />
  );
}
