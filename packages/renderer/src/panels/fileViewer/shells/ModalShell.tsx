import { useCallback, useEffect } from "react";
import { X } from "lucide-react";
import { useStore } from "../../../state/store.js";
import { FileViewer } from "../FileViewer.js";

/* Modal shell — full-viewport overlay with backdrop. Clicking the
   backdrop or pressing Escape closes; closing flips
   `fileViewerModalDismissed` so the floating "Reopen viewer" pill
   shows up until the user picks another layout or reopens. */
export function ModalShell(): JSX.Element {
  const setOpen = useStore((s) => s.setFileViewerModalOpen);

  const close = useCallback(() => setOpen(false), [setOpen]);

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [close]);

  const onBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) close();
    },
    [close],
  );

  return (
    <div
      className="fv-modal-backdrop"
      role="presentation"
      onClick={onBackdropClick}
    >
      <div
        className="fv-modal-pane"
        role="dialog"
        aria-modal="true"
        aria-label="File viewer"
      >
        <FileViewer
          trailingControls={
            <button
              type="button"
              className="fv-modal-close"
              onClick={close}
              title="Close (Esc)"
              aria-label="Close file viewer"
            >
              <X size={14} aria-hidden />
            </button>
          }
        />
      </div>
    </div>
  );
}
