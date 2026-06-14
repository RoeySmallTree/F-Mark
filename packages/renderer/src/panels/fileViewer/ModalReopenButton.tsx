import { Maximize2 } from "lucide-react";
import { useStore } from "../../state/store.js";

export function ModalReopenButton(): JSX.Element {
  const setOpen = useStore((s) => s.setFileViewerModalOpen);
  return (
    <button
      type="button"
      className="fv-floating-btn is-modal"
      onClick={() => setOpen(true)}
      title="Reopen file viewer"
      aria-label="Reopen file viewer"
    >
      <Maximize2 size={13} aria-hidden />
      <span>Reopen viewer</span>
    </button>
  );
}
