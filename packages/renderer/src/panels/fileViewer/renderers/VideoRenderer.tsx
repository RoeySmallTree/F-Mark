import { useMemo } from "react";
import { createClient } from "../../../api/client.js";
import { useStore } from "../../../state/store.js";
import { useScopedFile } from "../fileScope.js";

const NO_LOOSE_STRING_VALUES = {
  metadata: "metadata",
} as const;

export interface VideoRendererProps {
  path: string;
}

export function VideoRenderer({ path }: VideoRendererProps): JSX.Element {
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
    <div className="fv-video-wrap">
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video controls preload={NO_LOOSE_STRING_VALUES.metadata} src={url} />
    </div>
  );
}
