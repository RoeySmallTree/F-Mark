import type { JSX } from "react";
import { AgentKindArt } from "./participantAvatar/AgentKindArt.js";
import { avatarKind } from "./participantAvatar/kind.js";
import { useParticipantAvatarState } from "./participantAvatar/state.js";
import type { ParticipantAvatarProps } from "./participantAvatar/types.js";
import { ParticipantAvatarView } from "./participantAvatar/view.js";

export { AgentKindArt, avatarKind };
export type {
  AvatarKind,
  ParticipantAvatarInput,
  ParticipantAvatarProps,
} from "./participantAvatar/types.js";

export function ParticipantAvatar(props: ParticipantAvatarProps): JSX.Element {
  const state = useParticipantAvatarState(props);
  return <ParticipantAvatarView {...state} />;
}
