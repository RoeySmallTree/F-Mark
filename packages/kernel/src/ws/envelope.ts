import type { PathContextRef } from "../paths/contextRef.js";
import type { Bus, BusMessage } from "./bus.js";

/* Wraps a Bus so every published message carries the current (pathId,
   revision) envelope. Path-switched messages are passed through unchanged
   because they already include their own (new) pathId+revision — they
   announce the switch, so they must NOT be filtered by the renderer.

   For every other message: if pathId/revision haven't been set explicitly,
   inject from the ref. If the publisher already set them, keep theirs
   (used by /paths/active when it publishes path-switched). */
export function wrapBusWithEnvelope(raw: Bus, ref: PathContextRef): Bus {
  return {
    publish(message: BusMessage): void {
      if (message.type === "path-switched") {
        raw.publish(message);
        return;
      }
      const enveloped: BusMessage = {
        ...message,
        pathId: message.pathId ?? ref.pathId(),
        revision: message.revision ?? ref.revision(),
      };
      raw.publish(enveloped);
    },
  };
}
