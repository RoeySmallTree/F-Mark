import type { RuntimeOverridePatch } from "@f-mark/shared";
import { canonicalizeClaudeModelId } from "./adapters/claude.js";
import { getAdapter, type RuntimeAdapter } from "./adapters/index.js";

export class RuntimeModelValidationError extends Error {
  readonly status = 400;
}

export interface ValidateRuntimeModelPatchInput {
  runtimeId: string | null | undefined;
  model?: string | null;
  effort?: string | null;
  fallbackModel?: string | null;
  adapter?: RuntimeAdapter | null;
}

export async function validateRuntimeModelPatch(
  input: ValidateRuntimeModelPatchInput,
): Promise<RuntimeOverridePatch> {
  const runtimeId = input.runtimeId ?? null;
  const adapter = input.adapter ?? getAdapter(runtimeId);
  if (adapter === null) {
    throw new RuntimeModelValidationError(`runtime has no adapter: ${runtimeId}`);
  }

  const model =
    runtimeId === "claude" &&
    typeof input.model === "string" &&
    input.model.length > 0
      ? canonicalizeClaudeModelId(input.model)
      : input.model;

  await validateModel({
    adapter,
    runtimeId,
    model,
  });
  await validateEffort({
    adapter,
    runtimeId,
    effort: input.effort,
    model,
    fallbackModel: input.fallbackModel,
  });

  return {
    model,
    effort: input.effort,
  };
}

async function validateModel(input: {
  adapter: RuntimeAdapter;
  runtimeId: string | null;
  model?: string | null;
}): Promise<void> {
  if (typeof input.model !== "string" || input.model.length === 0) return;
  let models = await input.adapter.listModels();
  let hit = models.some((model) => model.id === input.model);
  if (!hit) {
    models = await input.adapter.listModels({ refresh: true });
    hit = models.some((model) => model.id === input.model);
  }
  if (hit) return;
  throw new RuntimeModelValidationError(
    `unknown model for ${input.runtimeId}: ${input.model}`,
  );
}

async function validateEffort(input: {
  adapter: RuntimeAdapter;
  runtimeId: string | null;
  effort?: string | null;
  model?: string | null;
  fallbackModel?: string | null;
}): Promise<void> {
  if (typeof input.effort !== "string" || input.effort.length === 0) return;
  const efforts = await input.adapter.listEfforts(
    typeof input.model === "string" ? input.model : input.fallbackModel ?? undefined,
  );
  if (efforts.length === 0 || efforts.some((effort) => effort.id === input.effort)) {
    return;
  }
  throw new RuntimeModelValidationError(
    `unknown effort for ${input.runtimeId}: ${input.effort}`,
  );
}
