import type { FastifyReply } from "fastify";
import { paths as makePaths, type Paths } from "../../paths.js";
import { activePaths } from "../../paths/active.js";
import type { PathContextRef } from "../../paths/contextRef.js";
import type { KernelState } from "../../state/store.js";
import type { Bus } from "../../ws/bus.js";
import type { TmuxManager } from "../../tmux/manager.js";
import { ensureProjectAuth } from "../../auth.js";
import { initProject, readConfig } from "../../project.js";
import { buildPathsResponse, type PathsResponse } from "./response.js";
import {
  validatePath,
  validateRequiredQueryPath,
  type PathErrorShape,
} from "./validation.js";

interface PathRouteContextOptions {
  ref: PathContextRef;
  busGetter?: () => Bus;
  tmuxGetter?: () => TmuxManager | null;
  token?: string | null;
  fallbackPaths?: Paths;
}

export class PathRouteContext {
  constructor(private readonly options: PathRouteContextOptions) {}

  global(): ReturnType<PathContextRef["global"]> {
    return this.options.ref.global();
  }

  mirrorRevision(state: KernelState): void {
    this.options.ref.setRevision(state.activeRevision);
  }

  async response(state: KernelState): Promise<PathsResponse> {
    return buildPathsResponse(
      state,
      this.options.ref,
      this.options.fallbackPaths,
    );
  }

  async responseAndBroadcast(state: KernelState): Promise<PathsResponse> {
    const response = await this.response(state);
    this.broadcastRegistry(response);
    return response;
  }

  async canonicalBodyPathOrSend(
    raw: unknown,
    reply: FastifyReply,
  ): Promise<string | null> {
    const validation = await validatePath(raw);
    if (validation.ok) return validation.canonical;
    this.sendError(reply, validation.status, validation.body);
    return null;
  }

  queryPathOrSend(raw: unknown, reply: FastifyReply): string | null {
    const error = validateRequiredQueryPath(raw);
    if (error === null) return raw as string;
    this.sendError(reply, 400, error);
    return null;
  }

  sendError(
    reply: FastifyReply,
    status: number,
    body: PathErrorShape,
  ): FastifyReply {
    return reply.code(status).send(body);
  }

  async activateCanonicalPath(
    canonical: string,
    state: KernelState,
  ): Promise<void> {
    await this.initSwitchedProject(makePaths(canonical));
    await ensureProjectAuth(makePaths(canonical), this.options.token ?? null);
    this.options.ref.setActive(activePaths(canonical));
    this.options.ref.setRevision(state.activeRevision);
    this.options.tmuxGetter?.()?.rebind({ projectRoot: canonical });
    this.broadcastSwitch(state);
  }

  clearActivePath(state: KernelState): void {
    this.options.ref.setActive(null);
    this.options.ref.setRevision(state.activeRevision);
    this.broadcastSwitch(state);
  }

  private broadcastSwitch(state: KernelState): void {
    const busGetter = this.options.busGetter;
    if (!busGetter) return;
    const active = this.options.ref.get().active;
    busGetter().publish({
      type: "path-switched",
      activePath: state.activePath,
      pathId: active ? active.pathId() : null,
      revision: state.activeRevision,
    });
  }

  private broadcastRegistry(response: PathsResponse): void {
    const busGetter = this.options.busGetter;
    if (!busGetter) return;
    busGetter().publish({
      type: "paths-updated",
      paths: response.paths.map(({ path, path_id }) => ({ path, path_id })),
    });
  }

  private async initSwitchedProject(target: Paths): Promise<void> {
    const port = await this.fallbackPort();
    if (port === undefined) await initProject(target);
    else await initProject(target, port);
  }

  private async fallbackPort(): Promise<number | undefined> {
    const fallbackPaths = this.options.fallbackPaths;
    if (fallbackPaths === undefined) return undefined;
    try {
      return (await readConfig(fallbackPaths)).port;
    } catch {
      return undefined;
    }
  }
}
