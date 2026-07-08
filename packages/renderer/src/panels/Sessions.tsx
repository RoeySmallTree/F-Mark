import type { JSX } from "react";
import { SessionsPanelView } from "./sessions/SessionsPanelView.js";
import { useSessionsController } from "./sessions/useSessionsController.js";

export function Sessions(): JSX.Element {
  const controller = useSessionsController();
  return <SessionsPanelView controller={controller} />;
}
