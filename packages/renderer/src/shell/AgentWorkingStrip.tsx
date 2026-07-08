import type { JSX } from "react";
import "../components/chips.css";
import { useAgentWorkingStripState } from "./agentWorkingStrip/state.js";
import type { AgentWorkingStripProps } from "./agentWorkingStrip/types.js";
import { AgentWorkingStripView } from "./agentWorkingStrip/view.js";

export function AgentWorkingStrip(props: AgentWorkingStripProps): JSX.Element {
  return <AgentWorkingStripView {...useAgentWorkingStripState(props)} />;
}

