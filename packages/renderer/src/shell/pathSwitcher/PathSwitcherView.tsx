import { type JSX } from "react";
import { ChevronDown, FolderClosed } from "lucide-react";
import { basename } from "./pathModel.js";
import { PathSwitcherMenu } from "./PathSwitcherMenu.js";
import { usePathSwitcherController } from "./usePathSwitcherController.js";

export function PathSwitcherView(): JSX.Element {
  const controller = usePathSwitcherController();

  return (
    <div ref={controller.rootRef} className="path-switcher">
      <button
        type="button"
        className="path-switcher-trigger"
        onClick={controller.toggleOpen}
        title={controller.activePath ?? "no active path"}
        aria-expanded={controller.open}
        aria-haspopup="menu"
      >
        <FolderClosed size={11} aria-hidden className="path-switcher-icon" />
        <span className="path-switcher-name">
          {basename(controller.activePath)}
        </span>
        <ChevronDown size={11} aria-hidden className="path-switcher-caret" />
      </button>

      {controller.open && (
        <PathSwitcherMenu
          activePath={controller.activePath}
          busy={controller.busy}
          error={controller.error}
          favorites={controller.favorites}
          onSelect={controller.switchTo}
          recents={controller.recents}
        />
      )}
    </div>
  );
}
