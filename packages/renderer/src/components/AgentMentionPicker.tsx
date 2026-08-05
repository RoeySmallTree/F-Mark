import { type JSX } from "react";
import { AgentMentionPickerView } from "./agentMentionPicker/AgentMentionPickerView.js";
import { useAgentMentionPickerController } from "./agentMentionPicker/useAgentMentionPickerController.js";
import type { ProseMention } from "@f-mark/shared";
import type { AgentMentionPickerProps } from "./agentMentionPicker/types.js";

interface Props extends AgentMentionPickerProps {
  /* Compose closes the picker after a pick; the three comment surfaces are
     multi-select and stay open. Declaring it here rather than closing from
     the caller's onSelect keeps every close path in one place. */
  closeOnSelect?: boolean;
  closing?: boolean;
}

export function AgentMentionPicker({
  closeOnSelect = false,
  closing = false,
  ...props
}: Props): JSX.Element {
  const controller = useAgentMentionPickerController(props);

  function onSelect(mention: ProseMention): void {
    props.onSelect(mention);
    if (closeOnSelect) props.onClose();
  }

  return (
    <AgentMentionPickerView
      {...props}
      onSelect={onSelect}
      controller={controller}
      closing={closing}
    />
  );
}
