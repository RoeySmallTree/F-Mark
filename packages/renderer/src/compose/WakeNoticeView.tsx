import { type JSX } from "react";
import { X } from "lucide-react";
import type { WakeSessionResponse } from "@f-mark/shared";
import { useStore } from "../state/store.js";
import { buildWakeNotice, wakeNoticeText } from "./wakeNotice.js";

interface Props {
  wake: WakeSessionResponse | null;
  onDismiss(): void;
}

/* Sits under the compose bar after a send, and only when an agent that could
   have answered did not. It is information, not a failure, so it does not use
   the alarm channel — a message that reached one of two agents is a normal
   state this app simply never used to mention. */
export function WakeNoticeView({ wake, onDismiss }: Props): JSX.Element | null {
  /* Not every mount has a populated participant map — the store starts empty
     and fills in. A notice that names an id is still useful; a notice that
     throws while rendering the compose bar is not. */
  const participants = useStore((s) => s.participants) ?? {};
  if (wake === null) return null;
  const notice = buildWakeNotice(wake, participants);
  if (notice === null) return null;

  return (
    <div className="compose-wake-notice" role="status">
      <span className="compose-wake-notice-text">{wakeNoticeText(notice)}</span>
      <button
        type="button"
        className="compose-wake-notice-dismiss"
        aria-label="Dismiss delivery notice"
        title="Dismiss"
        onClick={onDismiss}
      >
        <X size={12} aria-hidden="true" />
      </button>
    </div>
  );
}
