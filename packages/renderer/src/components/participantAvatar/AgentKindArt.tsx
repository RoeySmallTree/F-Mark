import type { JSX } from "react";
import { AvatarArt } from "./AvatarArt.js";
import { agentKindArtLines, agentKindArtTones } from "./agentKindArtPresets.js";
import type { AvatarKind } from "./types.js";

export function AgentKindArt({
  kind,
  className,
}: {
  kind: AvatarKind;
  className?: string;
}): JSX.Element | null {
  const lines = agentKindArtLines(kind);
  const tones = agentKindArtTones(kind);
  if (lines === undefined) {
    return null;
  }
  return (
    <span
      className={[className, "avatar-art-mark"].filter(Boolean).join(" ")}
      data-agent-kind-art={kind}
      aria-hidden="true"
    >
      <AvatarArt lines={lines} tones={tones} />
    </span>
  );
}
