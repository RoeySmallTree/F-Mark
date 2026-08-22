const NO_LOOSE_STRING_VALUES = {
  preview: "preview",
  source: "source",
  allowScripts: "allow-scripts",
} as const;

/* HtmlPreviewModal — fullscreen view of an html-event bundle, opened from
   EmbedCard and visual choice-option previews via store.openHtmlPreview.
   `preview` mode shows the live sandboxed iframe at large size; `source` mode
   fetches the bundle's index.html and shows it as escaped text. Backdrop +
   Escape close via ModalRoot; the shell stops propagation so only a true
   backdrop click closes. */

import { useEffect, useRef, useState, type JSX } from "react";
import { Code, Maximize2, X } from "lucide-react";
import { useStore } from "../state/store.js";
import { htmlBundleUrl } from "../render/htmlBundle.js";
import { useCurrentSessionRootScope } from "../hooks/useCurrentSessionRootScope.js";
import { useRovingTabIndex } from "../a11y/useRovingTabIndex.js";

const HTML_PREVIEW_MODE_ORDER = ["preview", "source"] as const satisfies Array<
  "preview" | "source"
>;

/* Focus trap: this dialog renders inside ModalBackdrop, which applies
   useFocusTrap to the shared container — see src/a11y/useFocusTrap.ts. */
export function HtmlPreviewModal(): JSX.Element | null {
  const htmlPreview = useStore((s) => s.htmlPreview);
  const token = useStore((s) => s.token);
  const scope = useCurrentSessionRootScope(htmlPreview?.sessionId ?? null);
  const closeModal = useStore((s) => s.closeModal);
  const [mode, setMode] = useState<"preview" | "source">(
    htmlPreview?.mode ?? NO_LOOSE_STRING_VALUES.preview,
  );
  const [source, setSource] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const modeButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const modeIndex = HTML_PREVIEW_MODE_ORDER.indexOf(mode);
  const { tabIndexFor, onKeyDown: onModeKeyDown } = useRovingTabIndex(
    HTML_PREVIEW_MODE_ORDER.length,
    modeIndex < 0 ? 0 : modeIndex,
    (index) => {
      const next = HTML_PREVIEW_MODE_ORDER[index];
      if (next === undefined) return;
      setMode(next);
      modeButtonRefs.current[index]?.focus();
    },
  );

  const filename = htmlPreview?.filename ?? "";
  const initialMode = htmlPreview?.mode ?? NO_LOOSE_STRING_VALUES.preview;
  // Re-seed the mode whenever a new bundle opens.
  useEffect(() => {
    setMode(initialMode);
  }, [filename, initialMode]);

  const url =
    htmlPreview !== null
      ? htmlBundleUrl(htmlPreview.sessionId, htmlPreview.filename, token, scope)
      : "";

  useEffect(() => {
    if (
      htmlPreview === null ||
      mode !== NO_LOOSE_STRING_VALUES.source ||
      url.length === 0
    )
      return;
    let cancelled = false;
    setSource(null);
    setError(null);
    void (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        if (!cancelled) setSource(text);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [htmlPreview, mode, url]);

  if (htmlPreview === null) return null;

  return (
    <div
      className="modal html-preview-modal"
      role="dialog"
      aria-modal="true"
      aria-label={`${htmlPreview.title} preview`}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="modal-head">
        <div className="modal-eyebrow">HTML PREVIEW</div>
        <h2 className="modal-title">{htmlPreview.title}</h2>
        <div
          className="html-preview-modes"
          role="tablist"
          onKeyDown={onModeKeyDown}
        >
          <button
            type="button"
            ref={(el) => {
              modeButtonRefs.current[0] = el;
            }}
            role="tab"
            aria-selected={mode === "preview"}
            tabIndex={tabIndexFor(0)}
            className={mode === "preview" ? "active" : ""}
            onClick={() => setMode(NO_LOOSE_STRING_VALUES.preview)}
          >
            <Maximize2 size={12} aria-hidden /> Preview
          </button>
          <button
            type="button"
            ref={(el) => {
              modeButtonRefs.current[1] = el;
            }}
            role="tab"
            aria-selected={mode === "source"}
            tabIndex={tabIndexFor(1)}
            className={mode === "source" ? "active" : ""}
            onClick={() => setMode(NO_LOOSE_STRING_VALUES.source)}
          >
            <Code size={12} aria-hidden /> Source
          </button>
        </div>
        <button
          type="button"
          className="icon-btn modal-close"
          aria-label="Close preview"
          onClick={closeModal}
        >
          <X size={14} aria-hidden />
        </button>
      </div>
      <div className="modal-body html-preview-body">
        {mode === NO_LOOSE_STRING_VALUES.preview ? (
          <iframe
            title={htmlPreview.title}
            src={url}
            sandbox={NO_LOOSE_STRING_VALUES.allowScripts}
          />
        ) : error !== null ? (
          <div className="html-source-msg">Failed to load source: {error}</div>
        ) : source === null ? (
          <div className="html-source-msg">Loading…</div>
        ) : (
          <pre className="html-source-code">
            <code>{source}</code>
          </pre>
        )}
      </div>
    </div>
  );
}
