/* Compose - public compose bar export. Root wiring and view adapters live in
   composeRoot so this file stays small for imports, tests, and Fallow. */

import { type JSX } from "react";
import { ComposeRootView } from "./composeRoot/ComposeRootView.js";
import { useComposeRootController } from "./composeRoot/useComposeRootController.js";

export function Compose(): JSX.Element {
  return <ComposeRootView controller={useComposeRootController()} />;
}
