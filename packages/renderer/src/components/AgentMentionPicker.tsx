import type { JSX } from "react";
import { AgentMentionPickerView } from "./agentMentionPicker/AgentMentionPickerView.js";
import { useAgentMentionPickerController } from "./agentMentionPicker/useAgentMentionPickerController.js";
import type { AgentMentionPickerProps } from "./agentMentionPicker/types.js";

export function AgentMentionPicker(props: AgentMentionPickerProps): JSX.Element {
  const controller = useAgentMentionPickerController(props);

  return <AgentMentionPickerView {...props} controller={controller} />;
}
