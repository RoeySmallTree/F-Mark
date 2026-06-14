import { ChevronDown, ChevronUp } from "lucide-react";
import { useStore } from "../../state/store.js";

export function ComposeReveal(): JSX.Element {
  const open = useStore((s) => s.fileViewerComposeOpenInFiles);
  const setOpen = useStore((s) => s.setFileViewerComposeOpen);
  return (
    <button
      type="button"
      className="fv-compose-toggle"
      onClick={() => setOpen(!open)}
      title={open ? "Hide compose" : "Show compose"}
      aria-pressed={open}
    >
      {open ? (
        <>
          <ChevronDown size={11} aria-hidden /> hide compose
        </>
      ) : (
        <>
          <ChevronUp size={11} aria-hidden /> show compose
        </>
      )}
    </button>
  );
}
