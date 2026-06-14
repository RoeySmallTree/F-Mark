import { useMemo } from "react";
import { createClient } from "../../../api/client.js";
import { useStore } from "../../../state/store.js";

export interface AudioRendererProps {
  path: string;
}

export function AudioRenderer({ path }: AudioRendererProps): JSX.Element {
  const token = useStore((s) => s.token);
  const client = useMemo(
    () => createClient({ baseUrl: "", token }),
    [token],
  );
  const url = client.fileContentUrl(path);
  return (
    <div className="fv-audio-wrap">
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio controls src={url} />
    </div>
  );
}
