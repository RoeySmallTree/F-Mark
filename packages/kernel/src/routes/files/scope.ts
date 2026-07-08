import type { FastifyReply } from "fastify";
import type { Paths } from "../../paths.js";
import { resolvePaths, type PathDeps } from "../pathDeps.js";
import {
  resolveKnownRootScope,
  type RootScopeError,
} from "../rootScope.js";

export interface AttachmentScopeQuery {
  path_id?: string;
  root?: string;
}

function hasAttachmentScope(query: AttachmentScopeQuery): boolean {
  return hasText(query.path_id) || hasText(query.root);
}

function hasText(value: unknown): boolean {
  return typeof value === "string" && value.length > 0;
}

function sendScopeError(reply: FastifyReply, scope: RootScopeError): void {
  reply.code(scope.status).send(scope.body);
}

export async function resolveAttachmentPaths(
  deps: PathDeps,
  query: AttachmentScopeQuery,
  reply: FastifyReply,
): Promise<Paths | null> {
  if (!hasAttachmentScope(query)) return resolvePaths(deps);

  const scope = await resolveKnownRootScope(deps, {
    path_id: query.path_id,
    root: query.root,
  });
  if (!scope.ok) {
    sendScopeError(reply, scope);
    return null;
  }
  return scope.known.paths;
}
