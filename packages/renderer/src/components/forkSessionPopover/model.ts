import type {
  ForkedAgentResult,
  ForkSessionRequest,
  ForkSessionResponse,
  SessionMeta,
} from "@f-mark/shared";

const NO_LOOSE_STRING_VALUES = {
  fork: "fork",
  fork2: "-fork",
  duplicated: "duplicated",
  relaunched: "relaunched",
} as const;

export function defaultForkName(session: Pick<SessionMeta, "slug">): string {
  const slug = session.slug.trim();
  if (slug.length === 0) return NO_LOOSE_STRING_VALUES.fork;
  return slug.endsWith(NO_LOOSE_STRING_VALUES.fork2) ? `${slug}-2` : `${slug}-fork`;
}

export function pathLabel(path: string | undefined): string {
  if (path === undefined || path.length === 0) return "current repo";
  const trimmed = path.replace(/\/+$/, "");
  const slash = trimmed.lastIndexOf("/");
  return slash >= 0 ? trimmed.slice(slash + 1) || trimmed : trimmed;
}

export function forkSessionRequest(
  target: SessionMeta,
  name: string,
  activePath: string | null,
): ForkSessionRequest {
  const path = target.path;
  return {
    name,
    ...(path !== undefined && path !== activePath ? { path } : {}),
  };
}

export function forkWarnings(
  result: ForkSessionResponse | null,
): string[] {
  if (result === null) return [];
  const agentWarnings = result.agents
    .filter((agent) => !isSuccessfulAgentFork(agent))
    .map((agent) => `${agent.display_name}: ${agent.status.replace(/^skipped-/, "")}`);
  return [...result.warnings, ...agentWarnings];
}

export function shouldCloseAfterFork(response: ForkSessionResponse): boolean {
  return response.warnings.length === 0 && response.agents.every(isSuccessfulAgentFork);
}

function isSuccessfulAgentFork(agent: ForkedAgentResult): boolean {
  return agent.status === NO_LOOSE_STRING_VALUES.duplicated || agent.status === NO_LOOSE_STRING_VALUES.relaunched;
}
