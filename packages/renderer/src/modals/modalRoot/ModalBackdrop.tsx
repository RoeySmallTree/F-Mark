import type { JSX, ReactNode } from "react";
import type { ModalKey } from "../../state/storeTypes.js";

interface ModalBackdropProps {
  activeModal: Exclude<ModalKey, null>;
  children: ReactNode;
  onClose(): void;
}

export function ModalBackdrop({
  activeModal,
  children,
  onClose,
}: ModalBackdropProps): JSX.Element {
  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      role="presentation"
      data-modal={activeModal}
    >
      {children}
    </div>
  );
}
