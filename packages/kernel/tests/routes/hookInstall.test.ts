import { describe, expect, it } from "vitest";
import Fastify from "fastify";
import { registerHookInstallRoutes } from "../../src/routes/hookInstall.js";

async function makeApp() {
  const app = Fastify();
  registerHookInstallRoutes(app);
  return app;
}

describe("hook-install routes", () => {
  it("GET hook-install-status returns gemini result", async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: "GET",
      url: "/managed-agents/hook-install-status?runtime_id=gemini&participant_id=ag-gemini-1",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().installed).toBe(false);
    await app.close();
  });

  it("GET hook-install-status 400 on missing params", async () => {
    const app = await makeApp();
    const res = await app.inject({ method: "GET", url: "/managed-agents/hook-install-status" });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("GET hook-install-status 400 on unknown runtime", async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: "GET",
      url: "/managed-agents/hook-install-status?runtime_id=unknown&participant_id=ag-x",
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("POST hook-install-instructions returns markdown + manualSteps", async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: "POST",
      url: "/managed-agents/hook-install-instructions?runtime_id=claude&participant_id=ag-claude-1&user_participant_id=us-1",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().markdown).toContain("ag-claude-1");
    expect(res.json().manualSteps[0].configPath).toBe("~/.claude/settings.json");
    await app.close();
  });

  it("POST hook-install-instructions 400 on missing params", async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: "POST",
      url: "/managed-agents/hook-install-instructions?runtime_id=claude",
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});
