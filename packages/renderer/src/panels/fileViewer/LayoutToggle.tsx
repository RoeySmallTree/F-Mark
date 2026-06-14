import { useCallback, useEffect, useRef, useState } from "react";
import {
  LayoutPanelLeft,
  PanelsLeftBottom,
  PanelsTopLeft,
  Maximize2,
  ChevronDown,
} from "lucide-react";
import {
  useStore,
  DEFAULT_FILE_VIEWER_LAYOUT,
  type FileViewerLayout,
} from "../../state/store.js";

interface LayoutOption {
  key: FileViewerLayout;
  label: string;
  hint: string;
  Icon: typeof LayoutPanelLeft;
}

const OPTIONS: LayoutOption[] = [
  {
    key: "replace-chat",
    label: "Replace chat",
    hint: "Show the viewer in place of the feed",
    Icon: PanelsTopLeft,
  },
  {
    key: "extra",
    label: "Extra pane",
    hint: "Open a resizable pane on the right (collapsible)",
    Icon: LayoutPanelLeft,
  },
  {
    key: "lower",
    label: "Lower split",
    hint: "Split the Files tab vertically",
    Icon: PanelsLeftBottom,
  },
  {
    key: "modal",
    label: "Modal",
    hint: "Open full-screen overlay",
    Icon: Maximize2,
  },
];

export function LayoutToggle(): JSX.Element {
  const activePath = useStore((s) => s.activePath);
  const layout = useStore((s) =>
    s.activePath !== null
      ? (s.fileViewerLayoutByPath[s.activePath] ??
        DEFAULT_FILE_VIEWER_LAYOUT)
      : DEFAULT_FILE_VIEWER_LAYOUT,
  );
  const setLayout = useStore((s) => s.setFileViewerLayout);
  const [open, setOpen] = useState(false);
  const popRef = useRef<HTMLDivElement | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent): void {
      if (!(e.target instanceof Node)) return;
      if (popRef.current?.contains(e.target)) return;
      if (btnRef.current?.contains(e.target)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") setOpen(false);
    }
    const id = window.setTimeout(
      () => window.addEventListener("mousedown", onDown),
      0,
    );
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const handleSelect = useCallback(
    (k: FileViewerLayout) => {
      setLayout(k);
      setOpen(false);
    },
    [setLayout],
  );

  const current = OPTIONS.find((o) => o.key === layout) ?? OPTIONS[0]!;
  const CurrentIcon = current.Icon;
  const disabled = activePath === null;

  return (
    <div className="fv-layout-toggle">
      <button
        ref={btnRef}
        type="button"
        className={`fv-layout-btn ${open ? "is-on" : ""}`}
        onClick={() => setOpen((v) => !v)}
        title={`Layout: ${current.label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
      >
        <CurrentIcon size={13} aria-hidden />
        <ChevronDown size={10} aria-hidden className="fv-layout-caret" />
      </button>
      {open ? (
        <div ref={popRef} className="fv-layout-pop" role="menu">
          {OPTIONS.map((o) => {
            const Icon = o.Icon;
            return (
              <button
                key={o.key}
                type="button"
                role="menuitem"
                className={`fv-layout-pop-item ${o.key === layout ? "is-current" : ""}`}
                onClick={() => handleSelect(o.key)}
              >
                <Icon size={14} aria-hidden className="fv-layout-pop-icon" />
                <span className="fv-layout-pop-label">{o.label}</span>
                <span className="fv-layout-pop-hint">{o.hint}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
