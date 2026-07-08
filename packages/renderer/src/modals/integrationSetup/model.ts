import type {
  IntegrationCheck,
  IntegrationLocation,
  IntegrationPreflightResponse,
  IntegrationScope,
  IntegrationStatus,
} from "@f-mark/shared";
import type { BusyState, SetupItemKind, SetupTab } from "./types.js";

const runtimeIds = {
  claude: "claude",
  codex: "codex",
  opencode: "opencode",
} as const;

const runtimeLabels: Record<string, string> = {
  [runtimeIds.claude]: "Claude",
  [runtimeIds.codex]: "Codex",
  [runtimeIds.opencode]: "Opencode",
};

export const setupTabs = {
  global: "global",
  local: "local",
} as const satisfies Record<string, SetupTab>;

const setupTabLabels = {
  global: "Globally",
  local: "Locally",
} as const satisfies Record<SetupTab, string>;

const integrationScopes = {
  user: "user",
  project: "project",
  local: "local",
} as const satisfies Record<string, IntegrationScope>;

const integrationScopeLabels = {
  global: "Global",
  projectLocal: "Project-local",
  project: "Project",
} as const;

export const integrationStatuses = {
  installed: "installed",
  missing: "missing",
  stale: "stale",
  blocked: "blocked",
  unsupported: "unsupported",
  notRequired: "not_required",
} as const satisfies Record<string, IntegrationStatus>;

export const setupItemKinds = {
  runtime: "runtime",
  mcp: "mcp",
  hooks: "hooks",
} as const satisfies Record<string, SetupItemKind>;

const setupStatusClasses = {
  ready: "ready",
  warn: "warn",
  missing: "missing",
} as const;

const actionLabels = {
  ready: "Ready",
  update: "Update",
  setup: "Setup",
  blocked: "Blocked",
  unavailable: "Unavailable",
} as const;

const itemCopyText = {
  runtimeReachable: "Installed and reachable",
  installRuntime: "Install the runtime first",
  ready: "Ready for this setup",
  stale: "Needs an update",
  missing: "Not set up yet",
  manualAttention: "Needs manual attention",
} as const;

const busyStates = {
  preflight: "preflight",
  apply: "apply",
  launch: "launch",
} as const satisfies Record<string, Exclude<BusyState, null>>;

const primaryLabels = {
  checking: "Checking",
  applying: "Applying",
  launching: "Launching",
  launch: "Launch",
} as const;

export function runtimeLabel(runtimeId: string): string {
  return runtimeLabels[runtimeId] ?? runtimeId;
}

export function scopeForTab(tab: SetupTab): IntegrationScope {
  return tab === setupTabs.global ? integrationScopes.user : integrationScopes.project;
}

export function setupTabForScope(scope: IntegrationScope): SetupTab {
  return scope === integrationScopes.user ? setupTabs.global : setupTabs.local;
}

export function tabLabel(tab: SetupTab): string {
  return tab === setupTabs.global ? setupTabLabels.global : setupTabLabels.local;
}

function scopeLabel(scope: IntegrationScope): string {
  if (scope === integrationScopes.user) return integrationScopeLabels.global;
  if (scope === integrationScopes.local) {
    return integrationScopeLabels.projectLocal;
  }
  return integrationScopeLabels.project;
}

export function locationMeta(location: IntegrationLocation | null): string | undefined {
  if (location === null) return undefined;
  return `${scopeLabel(location.scope)}: ${location.path}`;
}

function locationForTab(
  check: IntegrationCheck,
  tab: SetupTab,
): IntegrationLocation | null {
  const scope = scopeForTab(tab);
  const direct = check.locations.find((location) => location.scope === scope);
  if (direct !== undefined) return direct;
  if (tab === setupTabs.local) {
    const local = check.locations.find((location) => location.scope === integrationScopes.local);
    if (local !== undefined) return local;
  }
  return null;
}

export function readyStatus(status: IntegrationStatus | "unknown"): boolean {
  return status === integrationStatuses.installed || status === integrationStatuses.notRequired;
}

export function needsActionStatus(
  status: IntegrationStatus | "unknown",
): boolean {
  return status === integrationStatuses.missing || status === integrationStatuses.stale;
}

export function setupStatusClass(
  status: IntegrationStatus | "unknown",
): string {
  if (readyStatus(status)) return setupStatusClasses.ready;
  if (status === integrationStatuses.stale) return setupStatusClasses.warn;
  return setupStatusClasses.missing;
}

export function actionLabel(status: IntegrationStatus | "unknown"): string {
  if (readyStatus(status)) return actionLabels.ready;
  if (status === integrationStatuses.stale) return actionLabels.update;
  if (status === integrationStatuses.missing) return actionLabels.setup;
  if (status === integrationStatuses.blocked) return actionLabels.blocked;
  if (status === integrationStatuses.unsupported) return actionLabels.unavailable;
  return actionLabels.unavailable;
}

export function itemCopy(input: {
  kind: SetupItemKind;
  status: IntegrationStatus | "unknown";
	  location: IntegrationLocation | null;
	  runtimeAvailable?: boolean;
	  runtimeReason?: string;
	  tab: SetupTab;
	}): string {
  if (input.kind === setupItemKinds.runtime) {
    return input.runtimeAvailable === true
      ? itemCopyText.runtimeReachable
      : input.runtimeReason ?? itemCopyText.installRuntime;
  }
  if (readyStatus(input.status)) return itemCopyText.ready;
  if (input.status === integrationStatuses.stale) {
    return input.location?.reason ?? itemCopyText.stale;
  }
  if (input.status === integrationStatuses.missing) return itemCopyText.missing;
  if (input.status === integrationStatuses.blocked) {
    return input.location?.reason ?? itemCopyText.manualAttention;
  }
  if (input.status === integrationStatuses.unsupported) {
    return (
      input.location?.reason ??
      `${tabLabel(input.tab)} setup is not available here`
    );
  }
  return `${tabLabel(input.tab)} setup is not available`;
}

export function locationIssue(
  title: string,
  location: IntegrationLocation | null,
  tab: SetupTab,
): string {
  if (location?.reason !== undefined && location.reason.length > 0) {
    return `${title}: ${location.reason}`;
  }
  if (location?.status === integrationStatuses.unsupported) {
    return `${title}: ${tabLabel(tab)} setup is not supported for this runtime.`;
  }
  if (location?.status === integrationStatuses.blocked) {
    return `${title}: this setup needs manual attention.`;
  }
  return `${title}: setup cannot continue yet.`;
}

export class IntegrationSetupViewModel {
  constructor(
    readonly preflight: IntegrationPreflightResponse | null,
    readonly setupTab: SetupTab,
    readonly busy: BusyState,
  ) {}

  get selectedMcpLocation(): IntegrationLocation | null {
    return this.preflight === null
      ? null
      : locationForTab(this.preflight.mcp, this.setupTab);
  }

  get selectedHookLocation(): IntegrationLocation | null {
    return this.preflight === null
      ? null
      : locationForTab(this.preflight.hooks, this.setupTab);
  }

  get setupReady(): boolean {
    const mcpLocation = this.selectedMcpLocation;
    const hookLocation = this.selectedHookLocation;
    return (
      this.preflight !== null &&
      this.preflight.runtime.available &&
      mcpLocation !== null &&
      hookLocation !== null &&
      readyStatus(mcpLocation.status) &&
      readyStatus(hookLocation.status)
    );
  }

  get setupNeedsApply(): boolean {
    const mcpLocation = this.selectedMcpLocation;
    const hookLocation = this.selectedHookLocation;
    return (
      (mcpLocation !== null && needsActionStatus(mcpLocation.status)) ||
      (hookLocation !== null && needsActionStatus(hookLocation.status))
    );
  }

  get canApply(): boolean {
    if (this.preflight === null || !this.preflight.runtime.available) return false;
    if (!this.setupNeedsApply) return false;
    return (
      autoApplicable(this.selectedMcpLocation) ||
      autoApplicable(this.selectedHookLocation)
    );
  }

  get blocked(): boolean {
    return (
      this.selectedMcpLocation?.status === integrationStatuses.blocked ||
      this.selectedHookLocation?.status === integrationStatuses.blocked
    );
  }

  get primaryDisabled(): boolean {
    return (
      this.busy !== null ||
      this.preflight === null ||
      this.blocked ||
      !this.setupReady
    );
  }

  get primaryLabel(): string {
    if (this.busy === busyStates.preflight) return primaryLabels.checking;
    if (this.busy === busyStates.apply) return primaryLabels.applying;
    if (this.busy === busyStates.launch) return primaryLabels.launching;
    return primaryLabels.launch;
  }
}

function autoApplicable(location: IntegrationLocation | null): boolean {
  return (
    location !== null &&
    location.safe_auto_apply &&
    location.status !== integrationStatuses.blocked &&
    location.status !== integrationStatuses.unsupported
  );
}
