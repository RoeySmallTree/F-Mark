import type { FastifyInstance } from "fastify";
import type { EventKind } from "@f-mark/shared";
import { readEvents } from "../../events/reader.js";
import { readVisibleEvents } from "../../events/visible.js";
import type { PathDeps } from "../pathDeps.js";

/* This route stays RAW by default: the renderer consumes it and runs its own
   supersession resolution (it needs superseded delta files on hand to remap
   comments anchored to them onto the coalesced event). Visible-only consumers
   (MCP read_events) pass `?visible=true`. */
import { resolveKnownRootScope } from "../rootScope.js";
import { ensureEventSession } from "./scopedWrite.js";

interface EventReadQuery {
  since?: string;
  kinds?: string;
  participant?: string;
  path_id?: string;
  root?: string;
  /** Opt-in: hide superseded events (coalesced messages over their delta
   *  fragments). Set by MCP read_events; the renderer omits it and resolves
   *  supersession itself. */
  visible?: string;
}

export function registerEventReadRoute(
  app: FastifyInstance,
  deps: PathDeps,
): void {
  app.get<{
    Params: { id: string };
    Querystring: EventReadQuery;
  }>("/sessions/:id/events", async (req, reply) => {
    const scope = await resolveKnownRootScope(deps, {
      path_id: req.query.path_id,
      root: req.query.root,
    });
    if (!scope.ok) return reply.code(scope.status).send(scope.body);
    const p = scope.known.paths;
    if (!(await ensureEventSession(p, req.params.id, reply))) return;
    const kinds = req.query.kinds
      ?.split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0) as EventKind[] | undefined;
    const read = req.query.visible === "true" ? readVisibleEvents : readEvents;
    const events = await read(p, req.params.id, {
      since: req.query.since,
      kinds,
      participant: req.query.participant,
    });
    return { events };
  });
}
