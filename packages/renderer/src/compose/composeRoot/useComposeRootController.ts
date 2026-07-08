import type { ComposeRootController } from "./types.js";
import { useComposeRootActions } from "./useComposeRootActions.js";
import { useComposeRootCore } from "./useComposeRootCore.js";
import { useComposeRootServices } from "./useComposeRootServices.js";

export function useComposeRootController(): ComposeRootController {
  const core = useComposeRootCore();
  const services = useComposeRootServices(core);
  const actions = useComposeRootActions(core, services);

  return { core, services, actions };
}
