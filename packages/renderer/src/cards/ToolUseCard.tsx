/* ToolUseCard — per-event renderer for tool-use events, painted in the reference
   `.tool-call` vocabulary (agent-components.css).

   A native <details> row: a `.tool-type` badge (colored dot + tool kind) keyed
   off `iconForTool`, the `.tool-summary` detail, a live `.spin` / `.ok-dot` /
   `.err-dot` status, and an optional `.tool-dur`. Open by default while a result
   is still pending (the "turn ended mid-tool" case), on failure, or for compact
   internal tools. The body shows the presentation sections as `.io` blocks. */

import type { JSX } from "react";
import type { ToolUseEventRecord } from "@f-mark/shared";
import { ToolUseBody } from "./toolUseCard/ToolUseBody.js";
import { ToolUseHeader } from "./toolUseCard/ToolUseHeader.js";
import { toolCallClasses } from "./toolUseCard/model.js";
import { useToolUseDisclosure } from "./toolUseCard/useToolUseDisclosure.js";
import { presentToolUse } from "./toolPresentation.js";

interface Props {
  event: ToolUseEventRecord;
  autoOpen?: boolean;
  autoOpenRevision?: string;
}

export function ToolUseCard({
  event,
  autoOpen,
  autoOpenRevision,
}: Props): JSX.Element | null {
  const { tool_name, result, success, duration_ms } = event.payload;
  const presentation = presentToolUse(event.payload);
  const initiallyOpen =
    result === undefined || success === false || presentation?.compactInternal === true;
  const {
    bodyExpanded,
    bodyOverflowing,
    bodyRef,
    open,
    setBodyExpanded,
    toggleOpen,
  } = useToolUseDisclosure({
    autoOpen,
    autoOpenRevision,
    eventFilename: event.filename,
    initialOpen: initiallyOpen,
    presentation,
    result,
  });

  if (presentation === null) return null;
  const pending = result === undefined;
  const classes = toolCallClasses(success, presentation.compactInternal);

  return (
    <div
      className={`${classes}${open ? " open" : ""}`}
      data-event-kind="tool-use"
    >
      <ToolUseHeader
        durationMs={duration_ms}
        onToggle={toggleOpen}
        open={open}
        pending={pending}
        presentation={presentation}
        success={success}
        toolName={tool_name}
      />
      {open ? (
        <ToolUseBody
          bodyExpanded={bodyExpanded}
          bodyOverflowing={bodyOverflowing}
          bodyRef={bodyRef}
          onExpand={() => setBodyExpanded(true)}
          presentation={presentation}
        />
      ) : null}
    </div>
  );
}
