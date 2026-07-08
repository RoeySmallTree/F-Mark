import type { Participant } from "@f-mark/shared";
import { useStore } from "../../state/store.js";

interface SkillsPaletteBindings {
  closeModal: () => void;
  currentSessionId: string | null;
  openSkillEditor: ReturnType<typeof useStore.getState>["openSkillEditor"];
  participants: Record<string, Participant>;
  requestComposeInsertion: (text: string) => void;
  token: string | null;
}

export function useSkillsPaletteBindings(): SkillsPaletteBindings {
  const token = useStore((state) => state.token);
  const participants = useStore((state) => state.participants);
  const currentSessionId = useStore((state) => state.currentSessionId);
  const requestComposeInsertion = useStore(
    (state) => state.requestComposeInsertion,
  );
  const openSkillEditor = useStore((state) => state.openSkillEditor);
  const closeModal = useStore((state) => state.closeModal);

  return {
    closeModal,
    currentSessionId,
    openSkillEditor,
    participants,
    requestComposeInsertion,
    token,
  };
}
