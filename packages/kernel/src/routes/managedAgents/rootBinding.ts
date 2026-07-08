import { computePathId } from "../../paths/identity.js";
import type { PathContextRef } from "../../paths/contextRef.js";
import { paths as makePaths, type Paths } from "../../paths.js";
import {
  createAgentStateStore,
  createAgentStateStoreForRoot,
  type AgentStateStore,
} from "../../services/agentState.js";
import { resolveKnownRootScope, type KnownRoot } from "../rootScope.js";
import type { ManagedAgentRootBinding } from "./types.js";

export type RootScopeInput = {
  path_id?: unknown;
  root?: unknown;
};

export type RootBindingResult =
  | { ok: true; binding: ManagedAgentRootBinding }
  | { ok: false; status: number; error: string };

export class ManagedAgentRootBindingResolver {
  constructor(
    private readonly deps: {
      fallback: Paths;
      ref?: PathContextRef;
    },
  ) {}

  routePaths(): Paths {
    const active = this.deps.ref?.get().active ?? null;
    return active !== null ? makePaths(active.root()) : this.deps.fallback;
  }

  agentState(): AgentStateStore {
    return createAgentStateStore({
      ref: this.deps.ref,
      fallback: this.deps.fallback,
    });
  }

  activeBinding(): ManagedAgentRootBinding {
    return {
      paths: this.routePaths(),
      state: this.agentState(),
      tmuxRoot: null,
    };
  }

  bindingOrActive(
    binding?: ManagedAgentRootBinding | null,
  ): ManagedAgentRootBinding {
    return binding ?? this.activeBinding();
  }

  bindingForRoot(root: string): ManagedAgentRootBinding {
    const active = this.deps.ref?.get().active ?? null;
    const isActive = active !== null && active.root() === root;
    return {
      paths: makePaths(root),
      state: createAgentStateStoreForRoot(root, this.deps.ref?.global()),
      tmuxRoot: root,
      pathId: computePathId(root),
      ...(isActive && this.deps.ref !== undefined
        ? { revision: this.deps.ref.revision() }
        : {}),
    };
  }

  optionalBinding = async (input: RootScopeInput): Promise<RootBindingResult> => {
    if (input.path_id === undefined && input.root === undefined) {
      return { ok: true, binding: this.activeBinding() };
    }
    return this.requiredBinding(input);
  };

  requiredBinding = async (input: RootScopeInput): Promise<RootBindingResult> => {
    const scope = await resolveKnownRootScope(this.deps, {
      path_id: input.path_id,
      root: input.root,
    });
    if (!scope.ok) {
      return { ok: false, status: scope.status, error: scope.body.message };
    }
    return { ok: true, binding: this.bindingForKnownRoot(scope.known) };
  };

  private bindingForKnownRoot(known: KnownRoot): ManagedAgentRootBinding {
    return {
      paths: known.paths,
      state: createAgentStateStoreForRoot(known.root, this.deps.ref?.global()),
      tmuxRoot: known.root,
      pathId: known.path_id,
      ...(known.is_active && known.revision !== undefined
        ? { revision: known.revision }
        : {}),
    };
  }
}
