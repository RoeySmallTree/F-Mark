import { describe, expect, it } from "vitest";
import type {
  CurrentRuntimeState,
  EffortDescriptor,
  ModelDescriptor,
  RuntimeOverridePatch,
} from "@f-mark/shared";
import {
  RuntimeModelValidationError,
  validateRuntimeModelPatch,
} from "../../src/runtimes/modelValidation.js";
import type { AdapterReadContext, RuntimeAdapter } from "../../src/runtimes/adapters/index.js";

describe("validateRuntimeModelPatch", () => {
  it("validates current Claude provider aliases without rewriting them to stale slugs", async () => {
    const adapter = fakeAdapter({
      runtimeId: "claude",
      models: [{ id: "fable", displayName: "Fable" }],
    });

    await expect(
      validateRuntimeModelPatch({
        runtimeId: "claude",
        model: "fable",
        adapter,
      }),
    ).resolves.toEqual({ model: "fable", effort: undefined });
  });

  it("refreshes the model catalog before rejecting a stale miss", async () => {
    const adapter = fakeAdapter({
      models: [{ id: "old", displayName: "Old" }],
      refreshedModels: [{ id: "new", displayName: "New" }],
    });

    await expect(
      validateRuntimeModelPatch({
        runtimeId: "codex",
        model: "new",
        adapter,
      }),
    ).resolves.toEqual({ model: "new", effort: undefined });
    expect(adapter.modelCalls).toEqual([undefined, true]);
  });

  it("rejects an unknown model after the refresh fallback", async () => {
    const adapter = fakeAdapter({
      models: [{ id: "known", displayName: "Known" }],
      refreshedModels: [{ id: "known", displayName: "Known" }],
    });

    await expect(
      validateRuntimeModelPatch({
        runtimeId: "codex",
        model: "missing",
        adapter,
      }),
    ).rejects.toThrow(RuntimeModelValidationError);
  });

  it("validates effort against the selected model", async () => {
    const adapter = fakeAdapter({
      models: [{ id: "gpt-5", displayName: "GPT-5" }],
      effortsByModel: {
        "gpt-5": [{ id: "high", displayName: "High" }],
      },
    });

    await expect(
      validateRuntimeModelPatch({
        runtimeId: "codex",
        model: "gpt-5",
        effort: "low",
        adapter,
      }),
    ).rejects.toThrow("unknown effort for codex: low");
    expect(adapter.effortCalls).toEqual(["gpt-5"]);
  });

  it("skips effort validation when the adapter exposes no effort list", async () => {
    const adapter = fakeAdapter({
      models: [{ id: "local", displayName: "Local" }],
      effortsByModel: { local: [] },
    });

    await expect(
      validateRuntimeModelPatch({
        runtimeId: "opencode",
        model: "local",
        effort: "whatever",
        adapter,
      }),
    ).resolves.toEqual({ model: "local", effort: "whatever" });
  });
});

function fakeAdapter(input: {
  runtimeId?: RuntimeAdapter["runtimeId"];
  models: ModelDescriptor[];
  refreshedModels?: ModelDescriptor[];
  effortsByModel?: Record<string, EffortDescriptor[]>;
}): RuntimeAdapter & {
  modelCalls: Array<boolean | undefined>;
  effortCalls: Array<string | undefined>;
} {
  const modelCalls: Array<boolean | undefined> = [];
  const effortCalls: Array<string | undefined> = [];
  return {
    runtimeId: input.runtimeId ?? "codex",
    modelCalls,
    effortCalls,
    async listModels(opts?: { refresh?: boolean }) {
      modelCalls.push(opts?.refresh);
      return opts?.refresh ? input.refreshedModels ?? input.models : input.models;
    },
    async listEfforts(modelId?: string) {
      effortCalls.push(modelId);
      return input.effortsByModel?.[modelId ?? ""] ?? [];
    },
    async readCurrent(_ctx: AdapterReadContext): Promise<CurrentRuntimeState | null> {
      return null;
    },
    buildSpawnArgs(_patch: RuntimeOverridePatch): string[] {
      return [];
    },
    buildSpawnEnv(_patch: RuntimeOverridePatch): Record<string, string> {
      return {};
    },
    sanitizeArgs(existing: string[], _patch: RuntimeOverridePatch): string[] {
      return existing;
    },
  };
}
