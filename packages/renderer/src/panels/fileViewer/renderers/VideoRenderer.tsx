import { useMemo } from "react";
import { createClient } from "../../../api/client.js";
import { useStore } from "../../../state/store.js";

export interface VideoRendererProps {
  path: string;
}

export function VideoRenderer({ path }: VideoRendererProps): JSX.Element {
  const token = useStore((s) => s.token);
  const client = useMemo(
    () => createClient({ baseUrl: "", token }),
    [token],
  );
  const url = client.fileContentUrl(path);
  return (
    <div className="fv-video-wrap">
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video controls preload="metadata" src={url} />
    </div>
  );
}
