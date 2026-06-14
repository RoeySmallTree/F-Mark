import { describe, expect, it } from "vitest";
import Fastify from "fastify";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { registerHookInstallRoutes } from "../../src/routes/hookInstall.js";
import { paths } from "../../src/paths.js";
import { autoStreamHookCommand } from "../../src/hooksInstall/command.js";
import { withTempProject } from "../helpers/tempdir.js";

async function makeApp(root?: string) {
  const app = Fastify();
  const p = paths(root ?? "/tmp/fmark-noop");
  registerHookInstallRoutes(app, p);
  return app;
}

describe("hook-install routes", () => {
  it("GET hook-install-status returns opencode result", async () => {
    const savedHome = process.env.HOME;
    const home = await mkdtemp(join(tmpdir(), "fmark-oc-hook-route-home-"));
    process.env.HOME = home;
    const app = await makeApp();
    try {
      const res = await app.inject({
        method: "GET",
        url: "/managed-agents/hook-install-status?runtime_id=opencode&participant_id=ag-opencode-1",
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().installed).toBe(false);
    } finally {
      await app.close();
      if (savedHome === undefined) delete process.env.HOME;
      else process.env.HOME = savedHome;
      await rm(home, { recursive: true, force: true });
    }
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
      url: "/managed-agents/hook-install-instructions?runtime_id=claude",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().markdown).toContain("hook auto-stream");
    expect(res.json().markdown).not.toContain("npx -y f-mark");
    expect(res.json().markdown).not.toContain("ag-claude-1");
    expect(res.json().markdown).not.toContain("UserPromptSubmit");
    expect(res.json().manualSteps[0].configPath).toBe(
      ".claude/settings.json or ~/.claude/settings.json",
    );
    expect(res.json().promptSteps[0].text).toContain("hook auto-stream");
    expect(res.json().promptSteps[0].text).not.toContain("npx -y f-mark");
    await app.close();
  });

  it("POST hook-install-instructions 400 on missing runtime", async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: "POST",
      url: "/managed-agents/hook-install-instructions",
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("GET hook-install-status reads project-local .codex/config.toml when present", async () => {
    await withTempProject(async (root) => {
      const agentId = "ag-codex-projectlocal";
      const userId = "us-projectlocal";
      const agentCommand = autoStreamHookCommand({ participantId: agentId });
      const userCommand = autoStreamHookCommand({
        participantId: userId,
        kind: "user",
      });
      const toml = [
        "[features]",
        "hooks = true",
        "",
        "[[hooks.Stop]]",
        `command = ${JSON.stringify(agentCommand)}`,
        "timeout = 30",
        "",
        "[[hooks.UserPromptSubmit]]",
        `command = ${JSON.stringify(userCommand)}`,
        "timeout = 10",
        "",
        "[[hooks.PermissionRequest]]",
        `command = ${JSON.stringify(agentCommand)}`,
        "timeout = 300",
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
      expect(
        body.detectedEntries.some(
          (e: { event: string }) => e.event === "PermissionRequest",
        ),
      ).toBe(true);
      await app.close();
    });
  });

  it("POST hook-install-apply merges Claude hooks into project-local settings", async () => {
    await withTempProject(async (root) => {
      await mkdir(join(root, ".claude"), { recursive: true });
      await writeFile(
        join(root, ".claude", "settings.json"),
        JSON.stringify({ theme: "dark", hooks: { Stop: [{ hooks: [] }] } }),
        "utf8",
      );

      const app = await makeApp(root);
      const res = await app.inject({
        method: "POST",
        url: "/managed-agents/hook-install-apply?runtime_id=claude",
        payload: { scope: "local" },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.applied).toBe(true);
      expect(body.scope).toBe("local");
      expect(body.status.installed).toBe(true);
      expect(body.status.locations[0].installed).toBe(true);

      const saved = JSON.parse(
        await readFile(join(root, ".claude", "settings.json"), "utf8"),
      );
      expect(saved.theme).toBe("dark");
      expect(JSON.stringify(saved.hooks)).toContain("hook auto-stream");
      expect(JSON.stringify(saved.hooks)).not.toContain("npx -y f-mark");
      expect(JSON.stringify(saved.hooks)).not.toContain("ag-claude-1");
      expect(JSON.stringify(saved.hooks)).not.toContain("us-1");
      await app.close();
    });
  });
});
