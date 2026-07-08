/* Double-click spawn guard — a second click for the same runtime+session while
   a spawn job is still in flight must be a no-op (no second preflight/spawn),
   and the guard must release once the job settles so sequential spawns work. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { IntegrationPreflightResponse } from "@f-mark/shared";
import type { ManagedAgentsClient } from "../../src/api/managedAgents.js";
import { useSpawnRuntimeAction } from "../../src/hooks/useAgentSpawn/useSpawnRuntimeAction.js";

afterEach(() => {
  cleanup();
});

interface Deferred {
  resolve(value: IntegrationPreflightResponse): void;
  promise: Promise<IntegrationPreflightResponse>;
}

function deferred(): Deferred {
  let resolve!: (value: IntegrationPreflightResponse) => void;
  const promise = new Promise<IntegrationPreflightResponse>((r) => {
    resolve = r;
  });
  return { resolve, promise };
}

/* A preflight that does NOT allow launch, so the job settles on the
   integration-setup path without needing a spawn response. */
function blockedPreflight(): IntegrationPreflightResponse {
  return {
    runtime: { available: false },
    mcp: { status: "missing" },
    hooks: { status: "missing" },
  } as unknown as IntegrationPreflightResponse;
}

function makeHarness() {
  const gate = deferred();
  const preflight = vi.fn(() => gate.promise);
  const setIntegrationSetupFor = vi.fn();
  const apiClient = { preflight, spawn: vi.fn() } as unknown as ManagedAgentsClient;
  const hook = renderHook(() =>
    useSpawnRuntimeAction({
      apiClient,
      currentSessionId: "sess-1",
      managedAgentsDisabledReason: null,
      setManagedAgentsDisabledReason: vi.fn(),
      spawnRootScope: null,
      setConnectingAgents: vi.fn(),
      setIntegrationSetupFor,
      setSpawnError: vi.fn(),
      accessModeForRuntime: () => "default",
      modelForRuntime: () => "",
      effortForRuntime: () => "",
      onSpawnComplete: vi.fn(),
    }),
  );
  return { gate, preflight, setIntegrationSetupFor, hook };
}

describe("useSpawnRuntimeAction in-flight guard", () => {
  it("dedupes a double-click for the same runtime while the job is in flight", async () => {
    const { gate, preflight, setIntegrationSetupFor, hook } = makeHarness();

    hook.result.current("codex");
    hook.result.current("codex");
    expect(preflight).toHaveBeenCalledTimes(1);

    gate.resolve(blockedPreflight());
    // The blocked preflight settles the job via the integration-setup path.
    await waitFor(() =>
      expect(setIntegrationSetupFor).toHaveBeenCalledWith(
        expect.objectContaining({ runtimeId: "codex" }),
      ),
    );

    // After the job settles the guard releases: a new click runs again.
    hook.result.current("codex");
    expect(preflight).toHaveBeenCalledTimes(2);
  });

  it("does not block a different runtime while one is in flight", () => {
    const { preflight, hook } = makeHarness();

    hook.result.current("codex");
    hook.result.current("claude");
    expect(preflight).toHaveBeenCalledTimes(2);
  });
});
