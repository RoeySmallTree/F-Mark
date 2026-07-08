/* ModalRoot — single entry point for all modals.
   Reads store.activeModal, renders the appropriate modal lazily. Backdrop
   click + Escape both close. Other phases (P7/P8/P9/P12) plug their
   modals into the dispatch table below.

   Escape is handled with a direct window listener (not useHotkeys) because
   useHotkeys deliberately suppresses non-$mod chords when focus is inside an
   <input>/<textarea> — and a modal's first input is usually autofocused. */

import type { JSX } from "react";
import { useStore } from "../state/store.js";
import {
  ActiveModalContent,
  hasActiveModalContent,
} from "./modalRoot/ActiveModalContent.js";
import { ModalBackdrop } from "./modalRoot/ModalBackdrop.js";
import { useModalEscape } from "./modalRoot/useModalEscape.js";

export function ModalRoot(): JSX.Element | null {
  const activeModal = useStore((s) => s.activeModal);
  const closeModal = useStore((s) => s.closeModal);

  useModalEscape(activeModal, closeModal);

  if (activeModal === null) return null;
  if (!hasActiveModalContent(activeModal)) return null;

  const content = <ActiveModalContent activeModal={activeModal} />;

  return (
    <ModalBackdrop activeModal={activeModal} onClose={closeModal}>
      {content}
    </ModalBackdrop>
  );
}
