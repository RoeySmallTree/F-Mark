import {
  useMemo,
  useRef,
  useState,
  type JSX,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import type { AgentStatusRow } from "@f-mark/shared";
import { useDeferredUnmount } from "../../../popovers/useDeferredUnmount.js";
import { RightAgentViewModel } from "./agentPresentation.js";
import { AgentPopover } from "./AgentPopover.js";
import { RightAgentSummary } from "./RightAgentSummary.js";
import type { RightAgentsController, TerminalOverlayController } from "./types.js";

interface RightAgentRowProps {
  agent: AgentStatusRow;
  controller: RightAgentsController;
  /* Kept for API compatibility — terminal overlay is handled inside AgentPopover. */
  modalCtx: TerminalOverlayController | null;
}

export function RightAgentRow({
  agent,
  controller,
}: RightAgentRowProps): JSX.Element {
  const view = useMemo(
    () =>
      new RightAgentViewModel(
        agent,
        controller.participants,
        controller.events,
        controller.busy,
        controller.editing,
        controller.pickingColorFor,
      ),
    [
      agent,
      controller.participants,
      controller.events,
      controller.busy,
      controller.editing,
      controller.pickingColorFor,
    ],
  );

  const [popoverOpen, setPopoverOpen] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const popover = useDeferredUnmount(popoverOpen);

  function openPopover(): void {
    const rect = rowRef.current?.getBoundingClientRect() ?? null;
    setAnchorRect(rect);
    void controller.loadRuntimeOptions(agent);
    setPopoverOpen(true);
  }

  function togglePopover(): void {
    if (popoverOpen) {
      setPopoverOpen(false);
    } else {
      openPopover();
    }
  }

  function handleRowClick(e: MouseEvent): void {
    // Let clicks on nested interactive elements pass through without toggling the popover.
    if (
      (e.target as HTMLElement).closest("button, input, select, form, label") !== null
    )
      return;
    togglePopover();
  }

  function handleRowKeyDown(e: KeyboardEvent): void {
    if (
      (e.target as HTMLElement).closest("button, input, select, form, label") !== null
    )
      return;
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    togglePopover();
  }

  return (
    <>
      <div
        ref={rowRef}
        className={`agent-status-row${popoverOpen ? " is-open" : ""}`}
        data-state={view.tone}
        style={view.rowStyle}
        role="button"
        tabIndex={0}
        aria-haspopup="dialog"
        aria-expanded={popoverOpen}
        onClick={handleRowClick}
        onKeyDown={handleRowKeyDown}
      >
        <RightAgentSummary view={view} controller={controller} />
      </div>

      {popover.mounted && anchorRect !== null ? (
        <AgentPopover
          view={view}
          controller={controller}
          anchorRect={anchorRect}
          onClose={() => setPopoverOpen(false)}
          closing={popover.closing}
        />
      ) : null}
    </>
  );
}
