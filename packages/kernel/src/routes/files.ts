import type { FastifyInstance } from "fastify";
import type { Paths } from "../paths.js";
import type { Bus } from "../ws/bus.js";
import { normaliseDeps, type PathDeps } from "./pathDeps.js";
import {
  MAX_ATTACHMENT_BYTES,
  registerAttachmentRoutes,
} from "./files/attachments.js";
import { registerFileEventRoute } from "./files/fileEvents.js";

export { MAX_ATTACHMENT_BYTES };

export function registerFileRoutes(
  app: FastifyInstance,
  pOrDeps: Paths | PathDeps,
  getBus: () => Bus,
): void {
  const deps = normaliseDeps(pOrDeps);
  registerFileEventRoute(app, deps, getBus);
  registerAttachmentRoutes(app, deps);
}
