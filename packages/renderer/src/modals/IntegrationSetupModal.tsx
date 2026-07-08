import type { JSX } from "react";
import { IntegrationSetupView } from "./integrationSetup/IntegrationSetupView.js";
import type { IntegrationSetupModalProps } from "./integrationSetup/types.js";
import { useIntegrationSetupController } from "./integrationSetup/useIntegrationSetupController.js";

const NO_LOOSE_STRING_VALUES = {
  default: "default",
} as const;

export type { IntegrationSetupModalProps } from "./integrationSetup/types.js";

export function IntegrationSetupModal(
  props: IntegrationSetupModalProps,
): JSX.Element {
  const controller = useIntegrationSetupController(props);
  return (
    <IntegrationSetupView
      runtimeId={props.runtimeId}
      accessMode={props.accessMode ?? NO_LOOSE_STRING_VALUES.default}
      accessModeOptions={props.accessModeOptions ?? []}
      onAccessModeChange={props.onAccessModeChange}
      model={props.model ?? ""}
      effort={props.effort ?? ""}
      modelOptions={props.modelOptions ?? []}
      effortOptions={props.effortOptions ?? []}
      onModelChange={props.onModelChange}
      onEffortChange={props.onEffortChange}
      onClose={props.onClose}
      controller={controller}
    />
  );
}
