import type { State } from "../storeTypes.js";
import type { StoreSet } from "./sliceTypes.js";

const NO_LOOSE_STRING_VALUES = {
  user: "user",
} as const;

type ParticipantsSlice = Pick<
  State,
  | "participants"
  | "currentUserId"
  | "setParticipants"
  | "upsertParticipant"
  | "setCurrentUserId"
>;

export function createParticipantsSlice(set: StoreSet): ParticipantsSlice {
  return {
    participants: {},
    currentUserId: null,
    setParticipants: (participants) => {
      const userId = Object.entries(participants).find(
        ([, p]) => p.kind === NO_LOOSE_STRING_VALUES.user,
      )?.[0];
      set({ participants, currentUserId: userId ?? null });
    },
    upsertParticipant: (id, p) =>
      set((s) => ({ participants: { ...s.participants, [id]: p } })),
    setCurrentUserId: (currentUserId) => set({ currentUserId }),
  };
}
