import { dispatchManagedAgentWsMessageToState } from "../managedAgentWsDispatch.js";
import type { State } from "../storeTypes.js";
import type { StoreGet, StoreSet } from "./sliceTypes.js";

type ManagedAgentsSlice = Pick<
  State,
  | "managedAgentsDisabledReason"
  | "setManagedAgentsDisabledReason"
  | "dispatchManagedAgentWsMessage"
>;

export function createManagedAgentsSlice(
  set: StoreSet,
  get: StoreGet,
): ManagedAgentsSlice {
  return {
    managedAgentsDisabledReason: null,
    setManagedAgentsDisabledReason: (managedAgentsDisabledReason) =>
      set({ managedAgentsDisabledReason }),
    dispatchManagedAgentWsMessage: (msg) => {
      dispatchManagedAgentWsMessageToState(get(), msg);
    },
  };
}
