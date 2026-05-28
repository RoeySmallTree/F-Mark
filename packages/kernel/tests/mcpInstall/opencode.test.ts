import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { applyOpencodeMcp, detectOpencodeMcp } from "../../src/mcpInstall/opencode.js";

let tmp: string;
let env: NodeJS.ProcessEnv;

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), "fmark-oc-mcp-"));
  env = { ...process.env, HOME: tmp, XDG_CONFIG_HOME: join(tmp, ".config") };
});
afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe("mcpInstall/opencode", () => {
  test("detect: empty project — missing", async () => {
    const check = await detectOpencodeMcp({ runtimeId: "opencode", projectRoot: tmp, env });
    const project = check.locations.find((l) => l.scope === "project");
    expect(project?.status).toBe("missing");
    expect(project?.path).toBe(join(tmp, "opencode.json"));
  });

  test("apply project then detect installed; uses `environment` key", async () => {
    const applied = await applyOpencodeMcp({
      runtimeId: "opencode",
      projectRoot: tmp,
      scope: "project",
      env,
    });
    expect(applied.changed).toBe(true);
    expect(applied.location.path).toBe(join(tmp, "opencode.json"));

    const cfg = JSON.parse(await readFile(join(tmp, "opencode.json"), "utf8"));
    expect(cfg.mcp.fmark.type).toBe("local");
    expect(Array.isArray(cfg.mcp.fmark.command)).toBe(true);
    expect(cfg.mcp.fmark.command.length).toBeGreaterThan(0);
    expect(cfg.mcp.fmark.environment.F_MARK_MCP_VERSION).toBe("phase5-stdio-v1");
    expect(cfg.mcp.fmark.enabled).toBe(true);

    const check = await detectOpencodeMcp({ runtimeId: "opencode", projectRoot: tmp, env });
    const project = check.locations.find((l) => l.scope === "project");
    expect(project?.status).toBe("installed");
    expect(project?.version).toBe("phase5-stdio-v1");
  });

  test("apply is idempotent", async () => {
    await applyOpencodeMcp({
      runtimeId: "opencode",
      projectRoot: tmp,
      scope: "project",
      env,
    });
    const second = await applyOpencodeMcp({
      runtimeId: "opencode",
      projectRoot: tmp,
      scope: "project",
      env,
    });
    expect(second.changed).toBe(false);
  });

  test("preserves unrelated mcp servers", async () => {
    await writeFile(
      join(tmp, "opencode.json"),
      JSON.stringify(
        {
          mcp: {
            other: { type: "local", command: ["echo"], enabled: true },
          },
        },
        null,
        2,
      ),
    );
    await applyOpencodeMcp({
      runtimeId: "opencode",
      projectRoot: tmp,
      scope: "project",
      env,
    });
    const j = JSON.parse(await readFile(join(tmp, "opencode.json"), "utf8"));
    expect(j.mcp.other).toBeDefined();
    expect(j.mcp.fmark).toBeDefined();
  });

  test("prefers existing opencode.jsonc when both forms would be valid", async () => {
    await writeFile(
      join(tmp, "opencode.jsonc"),
      "// existing user config\n{ \"mcp\": {} }\n",
    );
    const applied = await applyOpencodeMcp({
      runtimeId: "opencode",
      projectRoot: tmp,
      scope: "project",
      env,
    });
    expect(applied.location.path).toBe(join(tmp, "opencode.jsonc"));
    const raw = await readFile(join(tmp, "opencode.jsonc"), "utf8");
    expect(raw).toContain('"fmark"');
  });

  test("detect handles jsonc with comments", async () => {
    await writeFile(
      join(tmp, "opencode.jsonc"),
      "// header comment\n{\n  // a comment\n  \"mcp\": { \"fmark\": { \"type\": \"local\", \"command\": [\"f-mark\"], \"environment\": { \"F_MARK_MCP_VERSION\": \"phase5-stdio-v1\" }, \"enabled\": true } }\n}\n",
    );
    const check = await detectOpencodeMcp({ runtimeId: "opencode", projectRoot: tmp, env });
    const project = check.locations.find((l) => l.scope === "project");
    expect(project?.status).toBe("installed");
  });

  test("detect handles trailing commas in jsonc", async () => {
    await writeFile(
      join(tmp, "opencode.jsonc"),
      "{\n  \"mcp\": { \"fmark\": { \"type\": \"local\", \"command\": [\"f-mark\"], \"environment\": { \"F_MARK_MCP_VERSION\": \"phase5-stdio-v1\" }, \"enabled\": true, }, },\n}\n",
    );
    const check = await detectOpencodeMcp({ runtimeId: "opencode", projectRoot: tmp, env });
    const project = check.locations.find((l) => l.scope === "project");
    expect(project?.status).toBe("installed");
  });

  test("detect reports stale on wrong version", async () => {
    await writeFile(
      join(tmp, "opencode.json"),
      JSON.stringify({
        mcp: {
          fmark: {
            type: "local",
            command: ["f-mark"],
            environment: { F_MARK_MCP_VERSION: "ancient-v0" },
            enabled: true,
          },
        },
      }),
    );
    const check = await detectOpencodeMcp({ runtimeId: "opencode", projectRoot: tmp, env });
    const project = check.locations.find((l) => l.scope === "project");
    expect(project?.status).toBe("stale");
    expect(project?.version).toBe("ancient-v0");
  });

  test("detect tolerates `env` key as forward-compat fallback", async () => {
    await writeFile(
      join(tmp, "opencode.json"),
      JSON.stringify({
        mcp: {
          fmark: {
            type: "local",
            command: ["f-mark"],
            env: { F_MARK_MCP_VERSION: "phase5-stdio-v1" },
            enabled: true,
          },
        },
      }),
    );
    const check = await detectOpencodeMcp({ runtimeId: "opencode", projectRoot: tmp, env });
    const project = check.locations.find((l) => l.scope === "project");
    expect(project?.status).toBe("installed");
  });

  test("user scope writes under $XDG_CONFIG_HOME/opencode/opencode.json", async () => {
    await mkdir(join(tmp, ".config/opencode"), { recursive: true });
    const applied = await applyOpencodeMcp({
      runtimeId: "opencode",
      projectRoot: tmp,
      scope: "user",
      env,
    });
    expect(applied.changed).toBe(true);
    expect(applied.location.path).toBe(join(tmp, ".config/opencode/opencode.json"));
  });

  test("blocked on invalid JSON", async () => {
    await writeFile(join(tmp, "opencode.json"), "{ not json }");
    const check = await detectOpencodeMcp({ runtimeId: "opencode", projectRoot: tmp, env });
    const project = check.locations.find((l) => l.scope === "project");
    expect(project?.status).toBe("blocked");
    expect(project?.reason).toMatch(/parse error/);
  });
});
