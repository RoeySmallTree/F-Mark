import { useStore } from "../../state/store.js";

export function CenterSwitcher(): JSX.Element {
  const value = useStore((s) => s.fileViewerReplaceCenter);
  const setValue = useStore((s) => s.setFileViewerReplaceCenter);
  return (
    <div
      className="fv-center-switcher"
      role="tablist"
      aria-label="Chat or files"
    >
      <button
        type="button"
        role="tab"
        aria-selected={value === "chat"}
        className={value === "chat" ? "is-on" : ""}
        onClick={() => setValue("chat")}
      >
        Chat
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={value === "files"}
        className={value === "files" ? "is-on" : ""}
        onClick={() => setValue("files")}
      >
        Files
      </button>
    </div>
  );
}
