import type { JSX } from "react";
import type { SessionBadge } from "../../../lib/sessionBadge.js";
import { beaconState } from "../model.js";

const NO_LOOSE_STRING_VALUES = {
  working: "working",
} as const;

interface SessionBeaconProps {
  badge: SessionBadge;
}

export function SessionBeacon(props: SessionBeaconProps): JSX.Element {
  const { badge } = props;

  return (
    <span
      className={`session-beacon ${beaconState(badge)}`}
      role="img"
      aria-label={badge}
      title={badge}
    >
      {badge === NO_LOOSE_STRING_VALUES.working ? (
        <>
          <span className="beacon-ring" aria-hidden="true" />
          <span className="beacon-ring r2" aria-hidden="true" />
        </>
      ) : badge === "awaiting input" || badge === "done unread" ? (
        <span className="beacon-ring" aria-hidden="true" />
      ) : null}
    </span>
  );
}
