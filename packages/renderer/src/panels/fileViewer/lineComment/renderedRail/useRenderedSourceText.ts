import { useEffect, useState } from "react";
import type { Client, RootScope } from "../../../../api/client.js";

interface ScopedFileRead {
  scope: RootScope;
  relPath: string;
}

interface UseRenderedSourceTextOptions {
  client: Client;
  path: string;
  scoped: ScopedFileRead | null;
}

export function useRenderedSourceText({
  client,
  path,
  scoped,
}: UseRenderedSourceTextOptions): string {
  const [text, setText] = useState("");
  const relPath = scoped?.relPath ?? null;
  const scope = scoped?.scope ?? null;
  const scopeKey = JSON.stringify(scope);

  useEffect(() => {
    if (scope === null || relPath === null) {
      setText("");
      return;
    }
    let cancelled = false;
    client
      .fetchFileText(scope, relPath, 8 * 1024 * 1024)
      .then((res) => {
        if (!cancelled) setText(res.content);
      })
      .catch(() => {
        if (!cancelled) setText("");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, client, relPath, scopeKey]);

  return text;
}
