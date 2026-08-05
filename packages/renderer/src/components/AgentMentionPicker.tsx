import type { JSX } from "react";
import { AgentMentionPickerView } from "./agentMentionPicker/AgentMentionPickerView.js";
import { useAgentMentionPickerController } from "./agentMentionPicker/useAgentMentionPickerController.js";
import type { ProseMention } from "@f-mark/shared";
import type { AgentMentionPickerProps } from "./agentMentionPicker/types.js";
import { usePopoverExit } from "../popovers/usePopoverExit.js";

interface Props extends AgentMentionPickerProps {
  /* Compose closes the picker after a pick; the three comment surfaces are
     multi-select and stay open. Declaring it here rather than closing from
     the caller's onSelect keeps every close path inside the exit wrap. */
  closeOnSelect?: boolean;
}

export function AgentMentionPicker({
  closeOnSelect = false,
  ...props
}: Props): JSX.Element {
  const { closing, requestClose } = usePopoverExit(props.onClose);
  const controller = useAgentMentionPickerController({
    ...props,
    onClose: requestClose,
  });

  function onSelect(mention: ProseMention): void {
    props.onSelect(mention);
    if (closeOnSelect) requestClose();
  }

  return (
    <AgentMentionPickerView
      {...props}
      onSelect={onSelect}
      onClose={requestClose}
      controller={controller}
      closing={closing}
    />
  );
}
