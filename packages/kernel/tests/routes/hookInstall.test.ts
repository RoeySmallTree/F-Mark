import { describe, expect, it } from "vitest";
import Fastify from "fastify";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { registerHookInstallRoutes } from "../../src/routes/hookInstall.js";
import { paths } from "../../src/paths.js";
import { withTempProject } from "../helpers/tempdir.js";

async function makeApp(root?: string) {
  const app = Fastify();
  const p = paths(root ?? "/tmp/fmark-noop");
  registerHookInstallRoutes(app, p);
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

  it("GET hook-install-status reads project-local .codex/config.toml when present", async () => {
    await withTempProject(async (root) => {
      const agentId = "ag-codex-projectlocal";
      const userId = "us-projectlocal";
      const toml = [
        "[[hooks.Stop]]",
        `command = ["npx", "-y", "f-mark", "hook", "auto-stream", "${agentId}"]`,
        "timeout = 30",
        "",
        "[[hooks.UserPromptSubmit]]",
        `command = ["npx", "-y", "f-mark", "hook", "auto-stream", "${userId}", "--kind", "user"]`,
        "timeout = 10",
        "",
      ].join("\n");
      await mkdir(join(root, ".codex"), { recursive: true });
      await writeFile(join(root, ".codex", "config.toml"), toml, "utf8");

      const app = await makeApp(root);
      const res = await app.inject({
        method: "GET",
        url: `/managed-agents/hook-install-status?runtime_id=codex&participant_id=${agentId}&user_participant_id=${userId}`,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.installed).toBe(true);
      expect(
        body.detectedEntries.some((e: { event: string }) => e.event === "Stop"),
      ).toBe(true);
      expect(
        body.detectedEntries.some(
          (e: { event: string }) => e.event === "UserPromptSubmit",
        ),
      ).toBe(true);
      await app.close();
    });
  });
});
