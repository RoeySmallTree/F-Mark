import { describe, expect, it } from "vitest";
import { terminalPollerKeyFor } from "../../src/routes/managedAgents/runtimeArgs.js";
import {
  registerBusPublishingTests,
  registerConfirmTokenTests,
  registerDeleteTests,
  registerEventWriteLifecycleTests,
  registerListTests,
  registerLogTests,
  registerTerminalKillTests,
  registerTerminalTests,
} from "./managedAgents/lifecycleTests.js";
import { registerIdleSweeperTests } from "./managedAgents/idleSweeperTests.js";
import {
  registerAccessResponseTests,
  registerInboxTests,
  registerWakeTests,
} from "./managedAgents/sessionRouteTests.js";
import { registerSpawnTests } from "./managedAgents/spawnTests.js";
import { registerHookStatusLaunchPromptTests } from "./managedAgents/hookPromptTests.js";
import {
  registerIntegrationApplyCleanupTests,
  registerPreflightTests,
  registerReconnectTests,
} from "./managedAgents/preflightReconnectTests.js";
import { registerRuntimeCatalogTests } from "./managedAgents/catalogTests.js";

describe("POST /managed-agents/spawn", registerSpawnTests);

describe("GET /managed-agents/:id/confirm-token", registerConfirmTokenTests);
describe("DELETE /managed-agents/:id", registerDeleteTests);
describe("POST /managed-agents/terminal", registerTerminalTests);
describe("DELETE /managed-agents/terminal", registerTerminalKillTests);
describe("GET /managed-agents", registerListTests);
describe("GET /managed-agents/:id/logs", registerLogTests);

describe("GET /sessions/:id/inbox", registerInboxTests);
describe(
  "POST /managed-agents/:id/access-requests/:requestId/respond",
  registerAccessResponseTests,
);

describe("idle managed-agent sweeper", registerIdleSweeperTests);
describe("POST /sessions/:id/wake", registerWakeTests);

describe("Bus publishing (managed-agent WS messages)", registerBusPublishingTests);
describe("event writes reconcile managed-agent lifecycle", registerEventWriteLifecycleTests);

describe(
  "POST /managed-agents/spawn — hooks_status + launch prompt",
  registerHookStatusLaunchPromptTests,
);

describe("POST /managed-agents/preflight", registerPreflightTests);
describe(
  "POST /managed-agents/integration-apply cleanup",
  registerIntegrationApplyCleanupTests,
);
describe("POST /managed-agents/:id/reconnect", registerReconnectTests);
describe("GET /runtimes/:runtimeId model catalog", registerRuntimeCatalogTests);

describe("terminalPollerKeyFor (review-phase2-round2 New issue #2)", () => {
  it("yields distinct keys for the same participant under different roots", () => {
    const a = terminalPollerKeyFor("path_aaaaaaaa", "p-1");
    const b = terminalPollerKeyFor("path_bbbbbbbb", "p-1");
    expect(a).not.toBe(b);
  });

  it("keeps single-root (active) behaviour: empty root key keyed by participant", () => {
    /* The active root supplies no pathId/tmuxRoot → rootKey "". Two different
       participants under the active root stay independent; the same participant
       under the active root stays stable (one poller, prior behaviour). */
    expect(terminalPollerKeyFor("", "p-1")).toBe("::p-1");
    expect(terminalPollerKeyFor("", "p-1")).toBe(terminalPollerKeyFor("", "p-1"));
    expect(terminalPollerKeyFor("", "p-1")).not.toBe(
      terminalPollerKeyFor("", "p-2"),
    );
  });

  it("does not let an active-root poller collide with a scoped-root poller for the same id", () => {
    /* Same participant, active root vs an explicit root → different keys, so
       one cannot suppress the other's scoped wake poller. */
    expect(terminalPollerKeyFor("", "p-1")).not.toBe(
      terminalPollerKeyFor("path_aaaaaaaa", "p-1"),
    );
  });
});
