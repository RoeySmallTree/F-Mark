import { type JSX, useState } from "react";
import type { ProsePayload } from "@f-mark/shared";
import type { EventCardProps } from "./eventCard/types.js";

/**
 * Renders a hook-injected prompt — a us-* prose with source:"hook", e.g. Codex's
 * memory-consolidation ("Memory Writing Agent") prompt that F-Mark's composer did
 * NOT originate — as a folded, expandable "Invoked a hook" card instead of a human
 * message bubble. See planning/hook-injected-activity/resolving-plan.md (Sections A/B).
 *
 * Conservative labeling: we can reliably say this reached the agent outside the
 * F-Mark composer; we do NOT claim it is definitely automated (a human could type
 * directly into the pane). The content stays fully inspectable when expanded.
 */
export function HookInvocationCard(props: EventCardProps): JSX.Element {
  const payload = props.event.payload as ProsePayload;
  const content = payload.content ?? "";
  const [open, setOpen] = useState(false);
  return (
    <details
      className="hook-card"
      data-source="hook"
      open={open}
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary>
        <span className="chev" aria-hidden>
          ›
        </span>
        <span className="hook-id">
          <b>Invoked a hook</b>
          <span>outside composer · not a message you sent</span>
        </span>
      </summary>
      <div className="hook-body">
        <pre className="io-raw">{content}</pre>
      </div>
    </details>
  );
}
