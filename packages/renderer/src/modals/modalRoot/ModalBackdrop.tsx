import { useRef, type JSX, type ReactNode } from "react";
import type { ModalKey } from "../../state/storeTypes.js";
import { useFocusTrap } from "../../a11y/useFocusTrap.js";

interface ModalBackdropProps {
  activeModal: Exclude<ModalKey, null>;
  children: ReactNode;
  onClose(): void;
}

/* Owns the focus trap for every modal routed through ModalRoot (new-session,
   settings, cmdk, skills, preset-editor, skill-editor, html-preview) — one
   useFocusTrap call here covers all seven dialog children instead of
   duplicating it per view. Each view still declares aria-modal="true" on its
   own root element; that element lives inside this backdrop's subtree, so
   the trap's focusable-element query reaches it the same as if the ref were
   on the dialog directly. */
export function ModalBackdrop({
  activeModal,
  children,
  onClose,
}: ModalBackdropProps): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, true);

  return (
    <div
      ref={ref}
      className="modal-backdrop"
      onClick={onClose}
      role="presentation"
      data-modal={activeModal}
    >
      {children}
    </div>
  );
}
