/* Agents section - Settings -> Connected agents.
   Lists live managed agents grouped by session and path. */

import type { JSX } from "react";
import { AgentsView } from "./agents/AgentsView.js";
import { useAgentsController } from "./agents/useAgentsController.js";

export function Agents(): JSX.Element {
  return <AgentsView controller={useAgentsController()} />;
}
