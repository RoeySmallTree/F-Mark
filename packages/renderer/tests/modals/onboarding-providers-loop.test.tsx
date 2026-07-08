import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode, useState, type JSX } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { IntegrationPreflightResponse } from "@f-mark/shared";
import type { AgentSpawnRuntime } from "../../src/hooks/useAgentSpawn.js";
import { ProvidersStep } from "../../src/modals/onboarding/ProvidersStep.js";

const RUNTIMES: AgentSpawnRuntime[] = [
  { id: "claude", displayName: "Claude Code", available: true },
  { id: "codex", displayName: "Codex", available: true },
  { id: "opencode", displayName: "Opencode", available: false },
];

// Fresh machine: no stored hook-scope preference, so the kernel replies with
// each runtime's *default* scope (resolveChosenScope → defaultScope) — "project"
// for claude, "user" for codex. The two disagree, which is what a new machine
// looks like before any integration has been applied.
function preflightFor(runtimeId: string): IntegrationPreflightResponse {
  const scope = runtimeId === "codex" ? "user" : "project";
  return {
    runtime: {
      runtime_id: runtimeId,
      executable: runtimeId,
      available: true,
      version: "1.0.0",
    },
    mcp: {
      status: "missing",
      locations: [
        { scope, path: `/tmp/${runtimeId}.mcp`, status: "missing", safe_auto_apply: true },
      ],
    },
    hooks: {
      status: "missing",
      locations: [
        { scope, path: `/tmp/${runtimeId}.hooks`, status: "missing", safe_auto_apply: true },
      ],
    },
    chosen_scope: scope,
    can_apply: true,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// A runaway scope<->preflight loop must fail the test fast rather than starve
// the microtask queue and hang. Once preflight is hit far more than the two
// available runtimes warrant, start erroring so the controller stops looping.
const RUNAWAY_HALT = 8;

// Real machines answer the two runtimes' preflights in *separate* event-loop
// ticks, so React can't batch the conflicting setScope calls away — each
// commits, re-fires the scope-keyed preflight effect, and the toggle oscillates.
// Distinct per-runtime delays reproduce that; a synchronous mock hides it
// (React batches project→user back to the initial "user", no re-render).
function delayFor(runtimeId: string): number {
  return runtimeId === "codex" ? 20 : 0;
}

function stubPreflightFetch(): () => number {
  let calls = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.includes("/managed-agents/preflight")) {
        calls += 1;
        if (calls > RUNAWAY_HALT) return jsonResponse({ error: "halt" }, 500);
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          runtime_id: string;
        };
        await new Promise((resolve) => setTimeout(resolve, delayFor(body.runtime_id)));
        return jsonResponse(preflightFor(body.runtime_id));
      }
      return jsonResponse({});
    }),
  );
  return () => calls;
}

// Mirrors the onboarding controller: chosenRuntimeId is parent state updated
// through onChoose, and flows back down as a prop.
function Harness(): JSX.Element {
  const [chosen, setChosen] = useState<string | null>(null);
  return (
    <ProvidersStep
      token="test-token"
      runtimes={RUNTIMES}
      disabledReason={null}
      chosenRuntimeId={chosen}
      modelForRuntime={() => "model"}
      effortForRuntime={() => "effort"}
      onChoose={(runtimeId) => setChosen(runtimeId)}
    />
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

describe("onboarding providers — preflight is not scope-triggered", () => {
  test("runs preflight once per available runtime even when runtimes disagree on scope", async () => {
    const preflightCalls = stubPreflightFetch();

    render(
      <StrictMode>
        <Harness />
      </StrictMode>,
    );

    await waitFor(() => expect(preflightCalls()).toBeGreaterThanOrEqual(2));
    // Give any feedback loop a window to run away before we assert it didn't.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 250));
    });

    // Two available runtimes, and the app mounts under StrictMode (main.tsx),
    // whose dev-only mount replay legitimately doubles this to 4. Either way the
    // count is *bounded*: the old scope<->preflight feedback loop drove it
    // unbounded (RUNAWAY_HALT caps the runaway at ~9), so anything past the
    // StrictMode ceiling means the loop is back.
    expect(preflightCalls()).toBeLessThanOrEqual(4);
  });

  test("scope toggle follows the chosen runtime (claude → Local), not whichever preflight resolves last", async () => {
    const preflightCalls = stubPreflightFetch();

    render(
      <StrictMode>
        <Harness />
      </StrictMode>,
    );

    // Wait for both runtimes to answer — codex is the slow one (20ms) and, if
    // it could write the shared scope, it would flip the toggle to Global last.
    await waitFor(() => expect(preflightCalls()).toBeGreaterThanOrEqual(2));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 60));
    });

    // Claude is auto-chosen as the first agent and its default scope is
    // "project" (Local). Codex (global-only, "user") must not hijack the single
    // shared toggle just because its preflight resolved later.
    const local = screen.getByRole("radio", { name: "Local" });
    const global = screen.getByRole("radio", { name: "Global" });
    expect(local).toHaveAttribute("aria-checked", "true");
    expect(global).toHaveAttribute("aria-checked", "false");
  });

  test("switching the chosen runtime to codex forces Global and disables Local", async () => {
    stubPreflightFetch();
    const user = userEvent.setup();

    render(
      <StrictMode>
        <Harness />
      </StrictMode>,
    );

    // Claude is auto-chosen and its default scope adopts to Local.
    const local = await screen.findByRole("radio", { name: "Local" });
    await waitFor(() => expect(local).toHaveAttribute("aria-checked", "true"));

    // Choosing codex must snap the shared toggle back to Global (codex is
    // global-only, CODEX_HOME) and disable Local — overriding the derived
    // default and exercising the derivation effect's codex branch on re-choose.
    await user.click(
      screen.getByRole("radio", { name: "Use Codex as your first agent" }),
    );

    await waitFor(() =>
      expect(screen.getByRole("radio", { name: "Global" })).toHaveAttribute(
        "aria-checked",
        "true",
      ),
    );
    expect(screen.getByRole("radio", { name: "Local" })).toBeDisabled();
  });
});
