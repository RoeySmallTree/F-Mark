import type { PathContextRef } from "../paths/contextRef.js";
import type { Bus, BusMessage } from "./bus.js";

/* Wraps a Bus so every published message carries the current (pathId,
   revision) envelope. Path registry messages are passed through unchanged
   because they describe registry/default metadata, not a root-owned payload
   that should be filtered by the selected session root.

   For every other message:
     - If the publisher set NEITHER pathId nor revision, inject the active
       (pathId, revision) from the ref — the default for active-root writes.
     - If the publisher set `pathId` explicitly (a root-scoped write,
       possibly for a BACKGROUND root), do NOT inject the active revision.
       The active revision belongs to the active root only; injecting it
       into a background-root envelope would create a mixed (wrong-pathId,
       active-revision) message that the renderer's revision filter mis-
       handles. A scoped publisher that genuinely wants a revision sets it
       itself (the active root carries `revision` on its KnownRoot). */
export function wrapBusWithEnvelope(raw: Bus, ref: PathContextRef): Bus {
  return {
    publish(message: BusMessage): void {
      if (message.type === "path-switched" || message.type === "paths-updated") {
        raw.publish(message);
        return;
      }
      const hasPathId = message.pathId !== undefined;
      const enveloped: BusMessage = {
        ...message,
        pathId: message.pathId ?? ref.pathId(),
        /* Only inject the active revision when the publisher didn't scope
           the message to a specific pathId. */
        revision:
          message.revision ?? (hasPathId ? undefined : ref.revision()),
      };
      raw.publish(enveloped);
    },
  };
}
