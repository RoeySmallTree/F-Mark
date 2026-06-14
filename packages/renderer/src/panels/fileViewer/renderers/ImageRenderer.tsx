import { useMemo } from "react";
import { createClient } from "../../../api/client.js";
import { useStore } from "../../../state/store.js";
import { basenameOf } from "./pickRenderer.js";

export interface ImageRendererProps {
  path: string;
}

export function ImageRenderer({ path }: ImageRendererProps): JSX.Element {
  const token = useStore((s) => s.token);
  const client = useMemo(
    () => createClient({ baseUrl: "", token }),
    [token],
  );
  const url = client.fileContentUrl(path);
  return (
    <div className="fv-image-wrap">
      <img src={url} alt={basenameOf(path)} />
    </div>
  );
}
