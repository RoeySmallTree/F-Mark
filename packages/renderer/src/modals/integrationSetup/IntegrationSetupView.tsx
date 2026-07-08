import { RefreshCw, X } from "lucide-react";
import type {
  EffortDescriptor,
  IntegrationStatus,
  ModelDescriptor,
  RuntimeAccessModeOption,
} from "@f-mark/shared";
import { RuntimeSelect } from "../../components/RuntimeSelect.js";
import {
  integrationStatuses,
  itemCopy,
  locationMeta,
  runtimeLabel,
  setupItemKinds,
  setupTabs,
  tabLabel,
} from "./model.js";
import { SetupItem, type SetupItemProps } from "./SetupItem.js";
import type { IntegrationSetupController } from "./useIntegrationSetupController.js";
import type { SetupTab } from "./types.js";

const setupTabList: SetupTab[] = [setupTabs.global, setupTabs.local];

const setupItemTitles = {
  runtime: "Runtime",
  mcp: "MCP",
  hooks: "Hook",
} as const;
const INTEGRATION_SETUP_VALUES = {
  codex: "codex",
  local: "local",
} as const;

interface IntegrationSetupViewProps {
  runtimeId: string;
  accessMode: string;
  accessModeOptions: RuntimeAccessModeOption[];
  onAccessModeChange?: (mode: string) => void;
  model: string;
  effort: string;
  modelOptions: ModelDescriptor[];
  effortOptions: EffortDescriptor[];
  onModelChange?: (model: string) => void;
  onEffortChange?: (effort: string) => void;
  onClose(): void;
  controller: IntegrationSetupController;
}

export function IntegrationSetupView({
  runtimeId,
  accessMode,
  accessModeOptions,
  onAccessModeChange,
  model,
  effort,
  modelOptions,
  effortOptions,
  onModelChange,
  onEffortChange,
  onClose,
  controller,
}: IntegrationSetupViewProps): JSX.Element {
  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      role="presentation"
      data-modal="integration-setup"
    >
      <div
        className="modal integration-setup-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="integration-setup-title"
        onClick={(event) => event.stopPropagation()}
      >
        <ModalHead runtimeId={runtimeId} onClose={onClose} />
        <ModalBody
          runtimeId={runtimeId}
          accessMode={accessMode}
          accessModeOptions={accessModeOptions}
          onAccessModeChange={onAccessModeChange}
          model={model}
          effort={effort}
          modelOptions={modelOptions}
          effortOptions={effortOptions}
          onModelChange={onModelChange}
          onEffortChange={onEffortChange}
          controller={controller}
        />
        <ModalFoot controller={controller} />
      </div>
    </div>
  );
}

function ModalHead({
  runtimeId,
  onClose,
}: {
  runtimeId: string;
  onClose(): void;
}): JSX.Element {
  return (
    <div className="modal-head">
      <div className="modal-eyebrow">INTEGRATION</div>
      <h2 className="modal-title" id="integration-setup-title">
        {runtimeLabel(runtimeId)}
      </h2>
      <button
        type="button"
        className="icon-btn modal-close"
        aria-label="Close"
        onClick={onClose}
      >
        <X size={14} aria-hidden />
      </button>
    </div>
  );
}

function ModalBody({
  runtimeId,
  accessMode,
  accessModeOptions,
  onAccessModeChange,
  model,
  effort,
  modelOptions,
  effortOptions,
  onModelChange,
  onEffortChange,
  controller,
}: Omit<IntegrationSetupViewProps, "onClose">): JSX.Element {
  return (
    <div className="modal-body">
      {controller.error !== null ? (
        <div role="alert" className="form-error integration-error">
          {controller.error}
        </div>
      ) : null}
      {controller.preflight === null ? (
        <div className="integration-loading">
          <RefreshCw size={14} aria-hidden /> Checking setup
        </div>
      ) : (
        <LoadedSetup
          runtimeId={runtimeId}
          accessMode={accessMode}
          accessModeOptions={accessModeOptions}
          onAccessModeChange={onAccessModeChange}
          model={model}
          effort={effort}
          modelOptions={modelOptions}
          effortOptions={effortOptions}
          onModelChange={onModelChange}
          onEffortChange={onEffortChange}
          controller={controller}
        />
      )}
    </div>
  );
}

function LoadedSetup({
  runtimeId,
  accessMode,
  accessModeOptions,
  onAccessModeChange,
  model,
  effort,
  modelOptions,
  effortOptions,
  onModelChange,
  onEffortChange,
  controller,
}: Omit<IntegrationSetupViewProps, "onClose">): JSX.Element {
  return (
    <>
      <SetupTabs
        runtimeId={runtimeId}
        setupTab={controller.setupTab}
        setSetupTab={controller.setSetupTab}
      />
      {controller.view.setupReady ? (
        <div className="integration-ready-label">
          We're all set up and ready to go
        </div>
      ) : null}
      <div className="integration-runtime-selects">
        <RuntimeSelect
          kind="model"
          label="Model"
          value={model}
          options={modelOptions}
          disabled={controller.busy !== null || onModelChange === undefined}
          description={`Used when this ${runtimeLabel(runtimeId)} agent launches.`}
          className="integration-access-mode"
          onChange={(value) => onModelChange?.(value)}
        />
        <RuntimeSelect
          kind="effort"
          label="Effort"
          value={effort}
          options={effortOptions}
          disabled={controller.busy !== null || onEffortChange === undefined}
          description={`Used when this ${runtimeLabel(runtimeId)} agent launches.`}
          className="integration-access-mode"
          onChange={(value) => onEffortChange?.(value)}
        />
        <AccessModeSelect
          runtimeId={runtimeId}
          accessMode={accessMode}
          accessModeOptions={accessModeOptions}
          disabled={controller.busy !== null || onAccessModeChange === undefined}
          onAccessModeChange={onAccessModeChange}
        />
      </div>
      <IntegrationItems runtimeId={runtimeId} controller={controller} />
    </>
  );
}

function SetupTabs({
  runtimeId,
  setupTab,
  setSetupTab,
}: {
  runtimeId: string;
  setupTab: SetupTab;
  setSetupTab(tab: SetupTab): void;
}): JSX.Element {
  return (
    <div className="integration-tabs" role="tablist" aria-label="Setup scope">
      {setupTabList.map((tab) => {
        const disabled =
          runtimeId === INTEGRATION_SETUP_VALUES.codex &&
          tab === INTEGRATION_SETUP_VALUES.local;
        return (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={setupTab === tab}
            className={`integration-tab${setupTab === tab ? " active" : ""}`}
            disabled={disabled}
            title={disabled ? "Codex is global-only (CODEX_HOME)" : undefined}
            onClick={() => {
              if (!disabled) setSetupTab(tab);
            }}
          >
            {tabLabel(tab)}
          </button>
        );
      })}
    </div>
  );
}

function AccessModeSelect({
  runtimeId,
  accessMode,
  accessModeOptions,
  disabled,
  onAccessModeChange,
}: {
  runtimeId: string;
  accessMode: string;
  accessModeOptions: RuntimeAccessModeOption[];
  disabled: boolean;
  onAccessModeChange?: (mode: string) => void;
}): JSX.Element | null {
  if (accessModeOptions.length === 0) return null;
  return (
    <label className="integration-access-mode">
      <span>
        <b>Permission mode</b>
        <small>Used when this {runtimeLabel(runtimeId)} agent launches.</small>
      </span>
      <select
        value={accessMode}
        disabled={disabled}
        onChange={(event) => onAccessModeChange?.(event.currentTarget.value)}
      >
        {accessModeOptions.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
            {option.deprecated === true ? " (deprecated)" : ""}
          </option>
        ))}
      </select>
    </label>
  );
}

function IntegrationItems({
  runtimeId,
  controller,
}: {
  runtimeId: string;
  controller: IntegrationSetupController;
}): JSX.Element {
  const { preflight, view } = controller;
  if (preflight === null) return <div className="integration-simple-list" />;
  return (
    <div className="integration-simple-list">
      {setupItems(runtimeId, controller).map((item) => (
        <SetupItem key={item.kind} {...item} />
      ))}
    </div>
  );
}

function setupItems(
  runtimeId: string,
  controller: IntegrationSetupController,
): SetupItemProps[] {
  const { preflight, setupTab, busy, view } = controller;
  if (preflight === null) return [];
  const runtimeStatus: IntegrationStatus | "unknown" = preflight.runtime.available
    ? integrationStatuses.installed
    : integrationStatuses.missing;
  return [
    {
      kind: setupItemKinds.runtime,
      title: setupItemTitles.runtime,
      status: runtimeStatus,
      detail: itemCopy({
        kind: setupItemKinds.runtime,
        status: runtimeStatus,
        location: null,
        runtimeAvailable: preflight.runtime.available,
        runtimeReason: preflight.runtime.reason,
        tab: setupTab,
      }),
      version: preflight.runtime.version,
      busy: busy !== null,
      onAction: preflight.runtime.available ? null : controller.showRuntimeIssue,
    },
    {
      kind: setupItemKinds.mcp,
      title: setupItemTitles.mcp,
      status: view.selectedMcpLocation?.status ?? integrationStatuses.unsupported,
      detail: itemCopy({
        kind: setupItemKinds.mcp,
        status:
          view.selectedMcpLocation?.status ?? integrationStatuses.unsupported,
        location: view.selectedMcpLocation,
        tab: setupTab,
      }),
      version: view.selectedMcpLocation?.version ?? preflight.mcp.expected_version,
      meta: locationMeta(view.selectedMcpLocation),
      busy: busy !== null,
      onAction: controller.setupActionFor(
        setupItemTitles.mcp,
        view.selectedMcpLocation,
      ),
    },
    {
      kind: setupItemKinds.hooks,
      title: setupItemTitles.hooks,
      status:
        view.selectedHookLocation?.status ?? integrationStatuses.unsupported,
      detail: itemCopy({
        kind: setupItemKinds.hooks,
        status:
          view.selectedHookLocation?.status ?? integrationStatuses.unsupported,
        location: view.selectedHookLocation,
        tab: setupTab,
      }),
      version:
        view.selectedHookLocation?.version ?? preflight.hooks.expected_version,
      meta: locationMeta(view.selectedHookLocation),
      busy: busy !== null,
      onAction: controller.setupActionFor(
        setupItemTitles.hooks,
        view.selectedHookLocation,
      ),
    },
  ];
}

function ModalFoot({
  controller,
}: {
  controller: IntegrationSetupController;
}): JSX.Element {
  return (
    <div className="modal-foot">
      <div />
      <div className="foot-actions">
        <button
          type="button"
          className="btn-solid"
          disabled={controller.view.primaryDisabled}
          onClick={() => {
            void controller.launch();
          }}
        >
          {controller.view.primaryLabel}
        </button>
      </div>
    </div>
  );
}
