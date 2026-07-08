import type {
  AgentStatusRow,
  ManagedAgentControlResponse,
} from "@f-mark/shared";
import type { FastifyInstance, FastifyReply } from "fastify";
import { checkHookInstallStatus as defaultCheckHookInstallStatus } from "../../hooksInstall/index.js";
import type { Paths } from "../../paths.js";
import type { AgentStateStore } from "../../services/agentState.js";
import { ManagedAgentAccessResponseService } from "./accessResponseService.js";
import { ManagedAgentCommandService } from "./commandService.js";
import { ManagedAgentCodexLiveTextPolling } from "./codexLiveTextPolling.js";
import { ManagedAgentIdleSweeper } from "./idleSweeper.js";
import { ManagedAgentIntegrationService } from "./integrationService.js";
import { ManagedAgentLaunchService } from "./launchService.js";
import { ManagedAgentResumeService } from "./resumeService.js";
import { ManagedAgentRootBindingResolver } from "./rootBinding.js";
import {
  requireScopedBinding,
  requireScopedParticipant,
} from "./routeRequest.js";
import { ManagedAgentRuntimeService } from "./runtimeService.js";
import { ManagedAgentStatusService } from "./statusService.js";
import { ManagedAgentTerminalAccessService } from "./terminalAccessService.js";
import { ManagedAgentTerminalPolling } from "./terminalPolling.js";
import type {
  ManagedAgentRootBinding as RootBinding,
  ManagedAgentsDeps,
} from "./types.js";
import { ManagedAgentWakeService } from "./wakeService.js";

export class ManagedAgentsRouteContext {
  declare readonly paths: ManagedAgentsDeps["paths"];
  declare readonly tmux: ManagedAgentsDeps["tmux"];
  declare readonly tracker: ManagedAgentsDeps["tracker"];
  declare readonly inputQueue: ManagedAgentsDeps["inputQueue"];
  declare readonly bus: ManagedAgentsDeps["bus"];
  declare readonly pathContextRef: ManagedAgentsDeps["pathContextRef"];
  declare readonly integrationEnv: NodeJS.ProcessEnv;
  declare readonly scopeResolver: ManagedAgentRootBindingResolver;
  declare readonly optionalRootBinding: ManagedAgentRootBindingResolver["optionalBinding"];
  declare readonly requiredRootBinding: ManagedAgentRootBindingResolver["requiredBinding"];
  declare readonly routePaths: () => Paths;
  declare readonly agentState: () => AgentStateStore;
  declare readonly bindingFor: (binding?: RootBinding | null) => RootBinding;
  declare readonly integrationService: ManagedAgentIntegrationService;
  declare readonly ensureLaunchProjectConnection: (p: Paths) => Promise<void>;
  declare readonly firstUserParticipantId: (
    p: Paths,
  ) => Promise<string | undefined>;
  declare readonly applyIntegrationWithManagedCleanup: ManagedAgentIntegrationService["applyIntegrationWithManagedCleanup"];
  declare readonly statusService: ManagedAgentStatusService;
  declare readonly buildStatusRows: (
    sessionFilter?: string,
    binding?: RootBinding | null,
  ) => ReturnType<ManagedAgentStatusService["buildRows"]>;
  declare readonly buildStatusRow: (
    participantId: string,
    binding?: RootBinding | null,
  ) => Promise<AgentStatusRow | null>;
  declare readonly controlResponse: (
    participantId: string,
    reply: FastifyReply,
    binding?: RootBinding | null,
  ) => Promise<ManagedAgentControlResponse | { error: string }>;
  declare readonly publishAgentUpdated: (
    participantId: string,
    binding?: RootBinding | null,
  ) => Promise<void>;
  declare readonly terminalAccessService: ManagedAgentTerminalAccessService;
  declare readonly terminalPolling: ManagedAgentTerminalPolling;
  declare readonly scheduleTerminalAccessPolling: (input: {
    participantId: string;
    runtimeId: string | null;
    binding?: RootBinding | null;
  }) => void;
  declare readonly codexLiveTextPolling: ManagedAgentCodexLiveTextPolling;
  declare readonly scheduleCodexLiveTextPolling: (input: {
    participantId: string;
    sessionId: string | null | undefined;
    runtimeId: string | null | undefined;
    binding?: RootBinding | null;
    reset?: boolean;
  }) => void;
  declare readonly launchService: ManagedAgentLaunchService;
  declare readonly commandService: ManagedAgentCommandService;
  declare readonly resumeService: ManagedAgentResumeService;
  declare readonly wakeService: ManagedAgentWakeService;
  declare readonly runtimeService: ManagedAgentRuntimeService;
  declare readonly accessResponseService: ManagedAgentAccessResponseService;

  constructor(deps: ManagedAgentsDeps) {
    Object.assign(this, createManagedAgentsRouteContextParts(deps));
  }

  optionalScopedBinding(
    scopeInput: { path_id?: unknown; root?: unknown },
    reply: FastifyReply,
  ) {
    return requireScopedBinding({
      scopeInput,
      reply,
      resolveScope: this.optionalRootBinding,
    });
  }

  optionalScopedParticipant(
    encodedId: string,
    scopeInput: { path_id?: unknown; root?: unknown },
    reply: FastifyReply,
  ) {
    return requireScopedParticipant({
      encodedId,
      scopeInput,
      reply,
      resolveScope: this.optionalRootBinding,
    });
  }

}

type ManagedAgentsRouteContextParts = Omit<
  ManagedAgentsRouteContext,
  "optionalScopedBinding" | "optionalScopedParticipant"
>;

type BaseContextParts = Pick<
  ManagedAgentsRouteContext,
  | "paths"
  | "tmux"
  | "tracker"
  | "inputQueue"
  | "bus"
  | "pathContextRef"
  | "integrationEnv"
  | "scopeResolver"
  | "optionalRootBinding"
  | "requiredRootBinding"
  | "routePaths"
  | "agentState"
  | "bindingFor"
>;

type IntegrationContextParts = Pick<
  ManagedAgentsRouteContext,
  | "integrationService"
  | "ensureLaunchProjectConnection"
  | "firstUserParticipantId"
  | "applyIntegrationWithManagedCleanup"
>;

type StatusContextParts = Pick<
  ManagedAgentsRouteContext,
  | "statusService"
  | "buildStatusRows"
  | "buildStatusRow"
  | "controlResponse"
  | "publishAgentUpdated"
>;

type PollingContextParts = Pick<
  ManagedAgentsRouteContext,
  | "terminalAccessService"
  | "terminalPolling"
  | "scheduleTerminalAccessPolling"
  | "codexLiveTextPolling"
  | "scheduleCodexLiveTextPolling"
>;

type LaunchCommandContextParts = Pick<
  ManagedAgentsRouteContext,
  "launchService" | "commandService"
>;

type ResumeWakeContextParts = Pick<
  ManagedAgentsRouteContext,
  "resumeService" | "wakeService"
>;

type RuntimeAccessContextParts = Pick<
  ManagedAgentsRouteContext,
  "runtimeService" | "accessResponseService"
>;

function createManagedAgentsRouteContextParts(
  deps: ManagedAgentsDeps,
): ManagedAgentsRouteContextParts {
  const base = createBaseContextParts(deps);
  const integration = createIntegrationContextParts(deps, base);
  const status = createStatusContextParts(base);
  const polling = createPollingContextParts(base, status);

  return {
    ...base,
    ...integration,
    ...status,
    ...polling,
    ...createLaunchCommandContextParts(deps, base, integration, status, polling),
    ...createResumeWakeContextParts(base, integration, status, polling),
    ...createRuntimeAccessContextParts(deps, base, integration, status, polling),
  };
}

function createBaseContextParts(deps: ManagedAgentsDeps): BaseContextParts {
  const scopeResolver = new ManagedAgentRootBindingResolver({
    fallback: deps.paths,
    ref: deps.pathContextRef,
  });
  return {
    paths: deps.paths,
    tmux: deps.tmux,
    tracker: deps.tracker,
    inputQueue: deps.inputQueue,
    bus: deps.bus,
    pathContextRef: deps.pathContextRef,
    integrationEnv: deps.env ?? process.env,
    scopeResolver,
    optionalRootBinding: scopeResolver.optionalBinding,
    requiredRootBinding: scopeResolver.requiredBinding,
    routePaths: () => scopeResolver.routePaths(),
    agentState: () => scopeResolver.agentState(),
    bindingFor: (binding?: RootBinding | null): RootBinding =>
      scopeResolver.bindingOrActive(binding),
  };
}

function createIntegrationContextParts(
  deps: ManagedAgentsDeps,
  base: BaseContextParts,
): IntegrationContextParts {
  const integrationService = new ManagedAgentIntegrationService({
    paths: base.paths,
    tmux: base.tmux,
    tracker: base.tracker,
    bus: base.bus,
    agentState: base.agentState,
    authToken: deps.authToken,
    kernelPort: deps.kernelPort,
    pathContextRef: base.pathContextRef,
    mcpHttpController: deps.mcpHttpController,
  });
  return {
    integrationService,
    ensureLaunchProjectConnection: (p: Paths): Promise<void> =>
      integrationService.ensureLaunchProjectConnection(p),
    firstUserParticipantId: (p: Paths): Promise<string | undefined> =>
      integrationService.firstUserParticipantId(p),
    applyIntegrationWithManagedCleanup:
      integrationService.applyIntegrationWithManagedCleanup.bind(
        integrationService,
      ),
  };
}

function createStatusContextParts(
  base: BaseContextParts,
): StatusContextParts {
  const statusService = new ManagedAgentStatusService({ tmux: base.tmux });
  const buildStatusRow = (
    participantId: string,
    binding?: RootBinding | null,
  ): Promise<AgentStatusRow | null> =>
    statusService.buildRow(participantId, base.bindingFor(binding));

  const publishAgentUpdated = async (
    participantId: string,
    binding?: RootBinding | null,
  ): Promise<void> => {
    const agent = await buildStatusRow(participantId, binding);
    if (agent === null) return;
    base.bus.publish({
      type: "managed-agent.updated",
      agent,
      ...(binding?.pathId !== undefined ? { pathId: binding.pathId } : {}),
      ...(binding?.revision !== undefined ? { revision: binding.revision } : {}),
    });
  };

  return {
    statusService,
    buildStatusRows: (sessionFilter, binding) =>
      statusService.buildRows(sessionFilter, base.bindingFor(binding)),
    buildStatusRow,
    controlResponse: async (participantId, reply, binding) => {
      const agent = await buildStatusRow(participantId, binding);
      if (agent === null) {
        reply.code(404);
        return { error: `agent not found: ${participantId}` };
      }
      return { agent };
    },
    publishAgentUpdated,
  };
}

function createPollingContextParts(
  base: BaseContextParts,
  status: StatusContextParts,
): PollingContextParts {
  const terminalAccessService = new ManagedAgentTerminalAccessService({
    tmux: base.tmux,
    bus: base.bus,
    bindingFor: base.bindingFor,
    publishAgentUpdated: status.publishAgentUpdated,
  });
  const terminalPolling = new ManagedAgentTerminalPolling({
    tmux: base.tmux,
    terminalAccessService,
    bindingFor: base.bindingFor,
  });
  const codexLiveTextPolling = new ManagedAgentCodexLiveTextPolling({
    bus: base.bus,
    integrationEnv: base.integrationEnv,
    bindingFor: base.bindingFor,
    publishAgentUpdated: status.publishAgentUpdated,
  });

  return {
    terminalAccessService,
    terminalPolling,
    scheduleTerminalAccessPolling: (input) => terminalPolling.schedule(input),
    codexLiveTextPolling,
    scheduleCodexLiveTextPolling: (input) => codexLiveTextPolling.schedule(input),
  };
}

function createLaunchCommandContextParts(
  deps: ManagedAgentsDeps,
  base: BaseContextParts,
  integration: IntegrationContextParts,
  status: StatusContextParts,
  polling: PollingContextParts,
): LaunchCommandContextParts {
  return {
    launchService: new ManagedAgentLaunchService({
      fallbackPaths: base.paths,
      pathContextRef: base.pathContextRef,
      tmux: base.tmux,
      tracker: base.tracker,
      inputQueue: base.inputQueue,
      bus: base.bus,
      hookStatusCheck:
        deps.checkHookInstallStatus ?? defaultCheckHookInstallStatus,
      integrationEnv: base.integrationEnv,
      ensureLaunchProjectConnection: integration.ensureLaunchProjectConnection,
      firstUserParticipantId: integration.firstUserParticipantId,
      applyIntegrationWithManagedCleanup:
        integration.applyIntegrationWithManagedCleanup,
      buildStatusRow: status.buildStatusRow,
      publishAgentUpdated: status.publishAgentUpdated,
      scheduleTerminalAccessPolling: polling.scheduleTerminalAccessPolling,
      scheduleCodexLiveTextPolling: polling.scheduleCodexLiveTextPolling,
    }),
    commandService: new ManagedAgentCommandService({
      tmux: base.tmux,
      inputQueue: base.inputQueue,
      bus: base.bus,
      scheduleTerminalAccessPolling: polling.scheduleTerminalAccessPolling,
      scheduleCodexLiveTextPolling: polling.scheduleCodexLiveTextPolling,
      publishAgentUpdated: status.publishAgentUpdated,
    }),
  };
}

function createResumeWakeContextParts(
  base: BaseContextParts,
  integration: IntegrationContextParts,
  status: StatusContextParts,
  polling: PollingContextParts,
): ResumeWakeContextParts {
  const resumeService = new ManagedAgentResumeService({
    tmux: base.tmux,
    tracker: base.tracker,
    integrationEnv: base.integrationEnv,
    ensureLaunchProjectConnection: integration.ensureLaunchProjectConnection,
    firstUserParticipantId: integration.firstUserParticipantId,
    publishAgentUpdated: status.publishAgentUpdated,
    scheduleTerminalAccessPolling: polling.scheduleTerminalAccessPolling,
    scheduleCodexLiveTextPolling: polling.scheduleCodexLiveTextPolling,
    paneAlive: liveSessionStillAlive,
  });

  return {
    resumeService,
    wakeService: new ManagedAgentWakeService({
      tmux: base.tmux,
      inputQueue: base.inputQueue,
      ensureForSession: (input) => resumeService.ensureForSession(input),
      publishAgentUpdated: status.publishAgentUpdated,
      scheduleTerminalAccessPolling: polling.scheduleTerminalAccessPolling,
      scheduleCodexLiveTextPolling: polling.scheduleCodexLiveTextPolling,
    }),
  };
}

function createRuntimeAccessContextParts(
  deps: ManagedAgentsDeps,
  base: BaseContextParts,
  integration: IntegrationContextParts,
  status: StatusContextParts,
  polling: PollingContextParts,
): RuntimeAccessContextParts {
  return {
    runtimeService: new ManagedAgentRuntimeService({
      fallbackPaths: base.paths,
      pathContextRef: base.pathContextRef,
      tmux: base.tmux,
      tracker: base.tracker,
      routePaths: base.routePaths,
      agentState: base.agentState,
      firstUserParticipantId: integration.firstUserParticipantId,
      ensureLaunchProjectConnection: integration.ensureLaunchProjectConnection,
      publishAgentUpdated: status.publishAgentUpdated,
      scheduleCodexLiveTextPolling: polling.scheduleCodexLiveTextPolling,
      paneAlive: liveSessionStillAlive,
    }),
    accessResponseService: new ManagedAgentAccessResponseService({
      tmux: base.tmux,
      inputQueue: base.inputQueue,
      bus: base.bus,
      buildStatusRow: status.buildStatusRow,
      publishAgentUpdated: status.publishAgentUpdated,
    }),
  };
}

export function startManagedAgentsIdleSweeper(
  app: FastifyInstance,
  context: ManagedAgentsRouteContext,
): void {
  const idleSweeper = new ManagedAgentIdleSweeper({
    paths: context.paths,
    tmux: context.tmux,
    tracker: context.tracker,
    pathContextRef: context.pathContextRef,
    publishUpdated: async (participantId, root) => {
      await context.publishAgentUpdated(
        participantId,
        context.scopeResolver.bindingForRoot(root),
      );
    },
  });
  idleSweeper.start();
  app.addHook("onClose", async () => {
    idleSweeper.stop();
  });
}

function liveSessionStillAlive(sessionName: string): boolean {
  // Cheap heuristic until tmux pane-watch reports back. The presence
  // tracker will replace this with its own probe on the next tick.
  return sessionName.length > 0;
}

export function createManagedAgentsRouteContext(
  deps: ManagedAgentsDeps,
): ManagedAgentsRouteContext {
  return new ManagedAgentsRouteContext(deps);
}
