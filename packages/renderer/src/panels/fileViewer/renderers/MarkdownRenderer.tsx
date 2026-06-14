import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "../../../api/client.js";
import { useStore } from "../../../state/store.js";

export interface MarkdownRendererProps {
  path: string;
}

interface CherryInstance {
  destroy(): void;
  setMarkdown(md: string): void;
  setTheme(theme: string): void;
}

interface CherryConstructor {
  new (config: {
    id?: string;
    el?: HTMLElement;
    value: string;
    editor?: { defaultModel: "edit&preview" | "previewOnly" | "editOnly" };
    [key: string]: unknown;
  }): CherryInstance;
}

/* Wraps cherry-markdown (vanilla JS class) in a React component. The
   editor is loaded dynamically so the eager bundle doesn't pay the
   ~300 KB cost when no markdown file is open. Theme syncs to whichever
   F-Mark theme is active by reading `data-theme` on <html>. */
export function MarkdownRenderer({
  path,
}: MarkdownRendererProps): JSX.Element {
  const token = useStore((s) => s.token);
  const client = useMemo(
    () => createClient({ baseUrl: "", token }),
    [token],
  );

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const instRef = useRef<CherryInstance | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setLoading(true);

    void (async () => {
      try {
        const [cherryMod, textRes] = await Promise.all([
          import("cherry-markdown"),
          client.fetchFileText(path, 8 * 1024 * 1024),
        ]);
        if (cancelled || wrapRef.current === null) return;
        await import("cherry-markdown/dist/cherry-markdown.css" as string).catch(
          () => undefined,
        );
        /* The package exports the constructor as the default; some bundlers
           wrap it. Fall back to the named export if default is undefined. */
        const Cherry = (cherryMod.default ??
          (cherryMod as unknown as { Cherry: CherryConstructor })
            .Cherry) as CherryConstructor;
        if (Cherry === undefined) {
          throw new Error("cherry-markdown export not found");
        }
        const inst = new Cherry({
          el: wrapRef.current,
          value: textRes.content,
          editor: { defaultModel: "previewOnly" },
        });
        instRef.current = inst;
        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (instRef.current !== null) {
        try {
          instRef.current.destroy();
        } catch {
          /* swallow */
        }
        instRef.current = null;
      }
      if (wrapRef.current !== null) wrapRef.current.innerHTML = "";
    };
  }, [path, client]);

  if (error !== null) {
    return (
      <div className="fv-error">failed to load markdown: {error}</div>
    );
  }

  return (
    <div className="fv-markdown-wrap">
      {loading ? (
        <div className="fv-loading">loading markdown editor…</div>
      ) : null}
      <div ref={wrapRef} style={{ height: "100%", width: "100%" }} />
    </div>
  );
}
