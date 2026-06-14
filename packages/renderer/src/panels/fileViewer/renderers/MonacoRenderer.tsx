import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { createClient } from "../../../api/client.js";
import { useStore } from "../../../state/store.js";
import { extOf, monacoLanguage } from "./pickRenderer.js";

const Editor = lazy(async () => {
  const mod = await import("@monaco-editor/react");
  return { default: mod.default };
});

export interface MonacoRendererProps {
  path: string;
}

function readThemeMode(): "light" | "dark" {
  const root = document.documentElement;
  const theme = root.getAttribute("data-theme") ?? "";
  /* F-Mark themes whose name implies dark backgrounds; fall back to
     prefers-color-scheme otherwise. */
  if (/dark|midnight|noir|matrix|aubergine/i.test(theme)) return "dark";
  if (/light|paper|cream|day/i.test(theme)) return "light";
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function MonacoRenderer({ path }: MonacoRendererProps): JSX.Element {
  const token = useStore((s) => s.token);
  const client = useMemo(
    () => createClient({ baseUrl: "", token }),
    [token],
  );

  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">(() =>
    typeof document !== "undefined" ? readThemeMode() : "light",
  );

  /* Re-read theme when the html `data-theme` attr changes. */
  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    const obs = new MutationObserver(() => setTheme(readThemeMode()));
    obs.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    setText(null);
    setError(null);
    setTruncated(false);
    client
      .fetchFileText(path, 8 * 1024 * 1024)
      .then((res) => {
        if (cancelled) return;
        setText(res.content);
        setTruncated(res.truncated);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [path, client]);

  if (error !== null) {
    return <div className="fv-error">failed to load file: {error}</div>;
  }
  if (text === null) {
    return <div className="fv-loading">loading…</div>;
  }

  const language = monacoLanguage(extOf(path));
  return (
    <div className="fv-monaco-wrap">
      {truncated ? (
        <div className="fv-loading">
          file truncated to first 8 MB — open externally for the full file
        </div>
      ) : null}
      <Suspense
        fallback={<div className="fv-loading">loading editor…</div>}
      >
        <Editor
          height="100%"
          width="100%"
          path={path}
          language={language}
          value={text}
          theme={theme === "dark" ? "vs-dark" : "vs"}
          options={{
            readOnly: true,
            minimap: { enabled: false },
            fontSize: 12,
            wordWrap: "on",
            scrollBeyondLastLine: false,
            renderLineHighlight: "none",
            automaticLayout: true,
          }}
        />
      </Suspense>
    </div>
  );
}
