import { useMemo } from "react";
import { createClient } from "../../../api/client.js";
import { useStore } from "../../../state/store.js";
import { useScopedFile } from "../fileScope.js";

export interface AudioRendererProps {
  path: string;
}

export function AudioRenderer({ path }: AudioRendererProps): JSX.Element {
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
    <div className="fv-audio-wrap">
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio controls src={url} />
    </div>
  );
}
