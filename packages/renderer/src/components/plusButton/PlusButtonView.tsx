import type { JSX } from "react";
import { ManageRuntimesMenuItem } from "./ManageRuntimesMenuItem.js";
import { RuntimeMenuList } from "./RuntimeMenuList.js";
import type { PlusButtonController } from "./types.js";

interface PlusButtonViewProps {
  controller: PlusButtonController;
}

export function PlusButtonView({
  controller,
}: PlusButtonViewProps): JSX.Element {
  return (
    <div className="plus-btn-wrap" ref={controller.wrapRef}>
      <button
        type="button"
        className="plus-btn"
        aria-label="Add agent"
        aria-haspopup="menu"
        aria-expanded={controller.open}
        onClick={controller.toggleOpen}
      >
        +
      </button>
      {controller.open ? (
        <div
          ref={controller.menuRef}
          className="plus-menu"
          data-placement={controller.menuPlacement ?? "pending"}
          role="menu"
          aria-label="Spawn options"
          style={controller.menuStyle}
        >
          <div className="plus-menu-head" aria-hidden>
            <span className="plus-menu-kicker">Launch surface</span>
            <strong>Add to session</strong>
            <span>{controller.runtimeItems.length} runtimes available</span>
          </div>

          <div className="plus-menu-section">
            <div className="plus-menu-section-label">Agents</div>
            <RuntimeMenuList
              items={controller.runtimeItems}
              expandedRuntimeId={controller.expandedRuntimeId}
              onAccessModeChange={controller.changeAccessMode}
              onModelChange={controller.changeModel}
              onEffortChange={controller.changeEffort}
              onToggleOptions={controller.toggleRuntimeOptions}
              onSpawnRuntime={controller.spawnRuntime}
            />
          </div>

          <div className="plus-menu-section plus-menu-section-utilities">
            <div className="plus-menu-section-label">Utilities</div>
            <ManageRuntimesMenuItem onClick={controller.manageRuntimes} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
