/* AgentLauncher — replaces <Feed/> + <Compose/> in the feed-col when the
   current session is empty AND no agent participant has connected to it.

   Renders the runtimes table (same source as the topbar `+` menu) as a stack
   of provider cards, each offering Connect (immediate spawn) and Configure
   (force-open IntegrationSetupModal). Footer links into the runtime
   settings panel. The compose preview at the bottom is intentionally
   non-interactive until an agent is connected. */

import { type JSX } from "react";
import { AgentLauncherView } from "./agentLauncher/AgentLauncherView.js";
import { useAgentLauncherController } from "./agentLauncher/useAgentLauncherController.js";
import "../components/chips.css";

export function AgentLauncher(): JSX.Element {
  const controller = useAgentLauncherController();
  return <AgentLauncherView controller={controller} />;
}
