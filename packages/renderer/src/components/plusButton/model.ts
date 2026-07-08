import type {
  EffortDescriptor,
  ModelDescriptor,
  RuntimeAccessModeOption,
} from "@f-mark/shared";
import type {
  PlusButtonRuntime,
  RuntimeMenuItemModel,
  TerminalMenuItemModel,
} from "./types.js";

const NO_LOOSE_STRING_VALUES = {
  default: "default",
  disabled: "disabled",
} as const;

interface RuntimeAccessResolvers {
  accessModeForRuntime?(id: string): string;
  accessModeOptionsForRuntime?(id: string): RuntimeAccessModeOption[];
  modelForRuntime?(id: string): string;
  effortForRuntime?(id: string): string;
  modelOptionsForRuntime?(id: string): ModelDescriptor[];
  effortOptionsForRuntime?(id: string): EffortDescriptor[];
}

export function buildRuntimeMenuItems(
  runtimes: PlusButtonRuntime[],
  accessResolvers: RuntimeAccessResolvers,
  spawnDisabledReason: string | null,
): RuntimeMenuItemModel[] {
  return runtimes.map((runtime) =>
    buildRuntimeMenuItem(runtime, accessResolvers, spawnDisabledReason),
  );
}

function buildRuntimeMenuItem(
  runtime: PlusButtonRuntime,
  accessResolvers: RuntimeAccessResolvers,
  spawnDisabledReason: string | null,
): RuntimeMenuItemModel {
  const accessModeOptions =
    accessResolvers.accessModeOptionsForRuntime?.(runtime.id) ?? [];
  const modelOptions = accessResolvers.modelOptionsForRuntime?.(runtime.id) ?? [];
  const effortOptions = accessResolvers.effortOptionsForRuntime?.(runtime.id) ?? [];

  return {
    ...runtime,
    ...runtimeAvailability(runtime.available, spawnDisabledReason),
    accessMode:
      accessResolvers.accessModeForRuntime?.(runtime.id) ??
      accessModeOptions[0]?.id ??
      NO_LOOSE_STRING_VALUES.default,
    accessModeOptions,
    model: accessResolvers.modelForRuntime?.(runtime.id) ?? "",
    effort: accessResolvers.effortForRuntime?.(runtime.id) ?? "",
    modelOptions,
    effortOptions,
  };
}

export function buildTerminalMenuItem(
  tmuxMissing: boolean | undefined,
  spawnDisabledReason: string | null,
): TerminalMenuItemModel {
  if (spawnDisabledReason !== null) {
    return {
      disabled: true,
      title: spawnDisabledReason,
      hint: NO_LOOSE_STRING_VALUES.disabled,
    };
  }

  if (tmuxMissing === true) {
    return {
      disabled: true,
      title: "tmux is not installed",
      hint: "tmux missing",
    };
  }

  return {
    disabled: false,
    title: undefined,
    hint: null,
  };
}

function runtimeAvailability(
  available: boolean,
  spawnDisabledReason: string | null,
): Pick<RuntimeMenuItemModel, "disabled" | "title" | "hint"> {
  if (spawnDisabledReason !== null) {
    return {
      disabled: true,
      title: spawnDisabledReason,
      hint: NO_LOOSE_STRING_VALUES.disabled,
    };
  }

  if (!available) {
    return {
      disabled: true,
      title: "Not on PATH",
      hint: "Not on PATH",
    };
  }

  return {
    disabled: false,
    title: undefined,
    hint: null,
  };
}
