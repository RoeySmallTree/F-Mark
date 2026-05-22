/* ModalRoot — single entry point for all modals.
   Reads store.activeModal, renders the appropriate modal lazily. Backdrop
   click + Escape both close. Other phases (P7/P8/P9/P12) plug their
   modals into the dispatch table below.

   Escape is handled with a direct window listener (not useHotkeys) because
   useHotkeys deliberately suppresses non-$mod chords when focus is inside an
   <input>/<textarea> — and a modal's first input is usually autofocused. */

import { useEffect, type JSX } from "react";
import { useStore } from "../state/store.js";
import { NewSessionModal } from "./NewSessionModal.js";
import { SettingsModal } from "./settings/SettingsModal.js";

export function ModalRoot(): JSX.Element | null {
  const activeModal = useStore((s) => s.activeModal);
  const closeModal = useStore((s) => s.closeModal);

  // Escape closes any active modal. We attach the listener only while a modal
  // is open so we don't interfere with Escape handlers elsewhere (compose's
  // textarea blur, etc.).
  useEffect(() => {
    if (activeModal === null) return;
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape" || e.key === "Esc") {
        e.preventDefault();
        e.stopPropagation();
        closeModal();
      }
    }
    // Capture phase so we beat any inner element's keydown handler.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [activeModal, closeModal]);

  if (activeModal === null) return null;

  // P10 wires 'new-session', P11 wires 'settings'. Other keys remain
  // placeholders — P7/P8/P9/P12 will plug into this dispatch.
  let content: JSX.Element | null = null;
  if (activeModal === "new-session") {
    content = <NewSessionModal />;
  } else if (activeModal === "settings") {
    content = <SettingsModal />;
  }
  if (content === null) return null;

  return (
    <div
      className="modal-backdrop"
      onClick={closeModal}
      role="presentation"
      data-modal={activeModal}
    >
      {content}
    </div>
  );
}
