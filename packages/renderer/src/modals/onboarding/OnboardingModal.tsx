import { type JSX } from "react";
import { OnboardingView } from "./OnboardingView.js";
import { useOnboardingController } from "./useOnboardingController.js";

export interface OnboardingModalProps {
  /** Called after the wizard finishes or is skipped. App clears its gate. */
  onClose(): void;
}

export function OnboardingModal({ onClose }: OnboardingModalProps): JSX.Element {
  return <OnboardingView controller={useOnboardingController({ onClose })} />;
}
