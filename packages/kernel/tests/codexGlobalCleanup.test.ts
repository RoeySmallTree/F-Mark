import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { applyCodexHooks } from "../src/hooksInstall/codex.js";
import { applyCodexMcp } from "../src/mcpInstall/codex.js";
import { cleanupCodexGlobalFmarkInstall } from "../src/codexGlobalCleanup.js";

const homes: string[] = [];

afterEach(async () => {
  await Promise.all(homes.splice(0).map((h) => rm(h, { recursive: true, force: true })));
});

async function installFmarkGlobals(): Promise<{
  env: NodeJS.ProcessEnv;
  configPath: string;
  hooksPath: string;
}> {
  const home = await mkdtemp(join(tmpdir(), "codex-cleanup-"));
  homes.push(home);
  const env: NodeJS.ProcessEnv = { HOME: home };
  await applyCodexHooks("ag-x", "us-y", env);
  await applyCodexMcp({
    runtimeId: "codex",
    scope: "user",
    projectRoot: "/tmp/proj",
    env,
  });
  const configPath = join(home, ".codex", "config.toml");
  const hooksPath = join(home, ".codex", "hooks.json");
  // Add unrelated content that migration MUST preserve.
  const config = await readFile(configPath, "utf8");
  await writeFile(
    configPath,
    `${config}\n[mcp_servers.other]\ncommand = "other-cmd"\nargs = []\n`,
    "utf8",
  );
  const hooks = JSON.parse(await readFile(hooksPath, "utf8")) as {
    hooks: Record<string, unknown[]>;
  };
  hooks.hooks.Stop = [
    ...(hooks.hooks.Stop ?? []),
    { hooks: [{ type: "command", command: "/usr/bin/user-own-hook", timeout: 5 }] },
  ];
  await writeFile(hooksPath, JSON.stringify(hooks, null, 2), "utf8");
  return { env, configPath, hooksPath };
}

describe("cleanupCodexGlobalFmarkInstall", () => {
  it("removes the fmark MCP server, fmark hooks, and fmark trust state", async () => {
    const { env, configPath, hooksPath } = await installFmarkGlobals();

    const result = await cleanupCodexGlobalFmarkInstall(env);
    expect(result.changed).toBe(true);

    const config = await readFile(configPath, "utf8");
    expect(config).not.toContain("[mcp_servers.fmark]");
    expect(config).not.toContain("mcp_servers.fmark.tools");
    expect(config).not.toMatch(/hooks\.json:stop/);
    const hooks = await readFile(hooksPath, "utf8");
    expect(hooks).not.toContain("auto-stream");
  });

  it("preserves unrelated MCP servers, unrelated hooks, and [features] hooks", async () => {
    const { env, configPath, hooksPath } = await installFmarkGlobals();

    await cleanupCodexGlobalFmarkInstall(env);

    const config = await readFile(configPath, "utf8");
    expect(config).toContain("[mcp_servers.other]");
    expect(config).toContain("other-cmd");
    expect(config).toMatch(/\[features\][\s\S]*hooks = true/);
    const hooks = await readFile(hooksPath, "utf8");
    expect(hooks).toContain("/usr/bin/user-own-hook");
  });

  it("strips a trust entry only when its stored hash matches the removed fmark hook", async () => {
    const { env, configPath } = await installFmarkGlobals();
    // Corrupt ONE fmark trust hash so it no longer matches the current hook.
    const before = await readFile(configPath, "utf8");
    const corrupted = before.replace(
      /trusted_hash = "sha256:[0-9a-f]+"/,
      'trusted_hash = "sha256:deadbeefdeadbeef"',
    );
    expect(corrupted).not.toBe(before);
    await writeFile(configPath, corrupted, "utf8");

    await cleanupCodexGlobalFmarkInstall(env);

    const after = await readFile(configPath, "utf8");
    // The mismatched-hash entry is preserved (not blindly deleted by key)…
    expect(after).toContain("sha256:deadbeefdeadbeef");
    // …while the hash-matching fmark trust entries are stripped (4 → 1 left).
    expect(after.match(/hooks\.json:/g)?.length ?? 0).toBe(1);
  });

  it("is idempotent — a second run reports no change", async () => {
    const { env } = await installFmarkGlobals();
    await cleanupCodexGlobalFmarkInstall(env);
    const second = await cleanupCodexGlobalFmarkInstall(env);
    expect(second.changed).toBe(false);
  });

  it("is a no-op when there is no codex config at all", async () => {
    const home = await mkdtemp(join(tmpdir(), "codex-cleanup-empty-"));
    homes.push(home);
    const result = await cleanupCodexGlobalFmarkInstall({ HOME: home });
    expect(result.changed).toBe(false);
  });

  async function bareCodexHome(
    hooksJson: string,
  ): Promise<{ env: NodeJS.ProcessEnv; hooksPath: string }> {
    const home = await mkdtemp(join(tmpdir(), "codex-cleanup-bare-"));
    homes.push(home);
    const { mkdir } = await import("node:fs/promises");
    await mkdir(join(home, ".codex"), { recursive: true });
    const hooksPath = join(home, ".codex", "hooks.json");
    await writeFile(hooksPath, hooksJson, "utf8");
    return { env: { HOME: home }, hooksPath };
  }

  it("leaves a hooks.json containing no fmark hooks byte-identical (no spurious rewrite)", async () => {
    const original =
      '{\n  "hooks": {\n    "Stop": [\n      { "hooks": [{ "type": "command", "command": "/usr/bin/user-hook", "timeout": 5 }] }\n    ]\n  }\n}\n';
    const { env, hooksPath } = await bareCodexHome(original);

    const result = await cleanupCodexGlobalFmarkInstall(env);

    expect(result.hooksChanged).toBe(false);
    expect(await readFile(hooksPath, "utf8")).toBe(original);
  });

  it("does not rewrite an empty-object hooks.json into { hooks: {} }", async () => {
    const { env, hooksPath } = await bareCodexHome("{}\n");
    const result = await cleanupCodexGlobalFmarkInstall(env);
    expect(result.hooksChanged).toBe(false);
    expect(await readFile(hooksPath, "utf8")).toBe("{}\n");
  });

  it("preserves a non-fmark hook whose command merely contains 'hook' and 'auto-stream'", async () => {
    const original =
      '{\n  "hooks": {\n    "Stop": [\n      { "hooks": [{ "type": "command", "command": "/opt/ci-hook run --mode auto-stream", "timeout": 5 }] }\n    ]\n  }\n}\n';
    const { env, hooksPath } = await bareCodexHome(original);

    const result = await cleanupCodexGlobalFmarkInstall(env);

    expect(result.hooksChanged).toBe(false);
    expect(await readFile(hooksPath, "utf8")).toContain("auto-stream");
  });
});
