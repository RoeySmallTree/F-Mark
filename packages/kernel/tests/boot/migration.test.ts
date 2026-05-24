import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { globalPaths } from "../../src/paths/global.js";
import { runV04Migration } from "../../src/boot/migration.js";
import { computePathId } from "../../src/paths/identity.js";

describe("runV04Migration", () => {
  it("no-ops when state.json already exists", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "fmark-mig-cwd-"));
    const cfg = mkdtempSync(join(tmpdir(), "fmark-mig-cfg-"));
    try {
      const g = globalPaths(cfg);
      mkdirSync(g.configDir(), { recursive: true });
      writeFileSync(g.stateFile(), JSON.stringify({ activePath: null }));
      const result = await runV04Migration(cwd, g);
      expect(result.migrated).toBe(false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
      rmSync(cfg, { recursive: true, force: true });
    }
  });

  it("seeds state.json on a fresh install with no <cwd>/.f-mark/", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "fmark-mig-cwd-"));
    const cfg = mkdtempSync(join(tmpdir(), "fmark-mig-cfg-"));
    try {
      const g = globalPaths(cfg);
      const result = await runV04Migration(cwd, g);
      expect(result.migrated).toBe(true);
      expect(result.pathId).toMatch(/^[0-9a-f]{12}$/);
      expect(existsSync(g.stateFile())).toBe(true);
      const state = JSON.parse(readFileSync(g.stateFile(), "utf8"));
      expect(state.activePath).toBe(cwd);
      expect(state.knownPaths).toContain(cwd);
      expect(state.activeRevision).toBe(1);
      // No agents to migrate.
      expect(result.movedAgents).toBeUndefined();
    } finally {
      rmSync(cwd, { recursive: true, force: true });
      rmSync(cfg, { recursive: true, force: true });
    }
  });

  it("moves <cwd>/.f-mark/agents/ to global projects/<pathId>/agents/", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "fmark-mig-cwd-"));
    const cfg = mkdtempSync(join(tmpdir(), "fmark-mig-cfg-"));
    try {
      mkdirSync(join(cwd, ".f-mark", "agents", "ag-claude"), { recursive: true });
      writeFileSync(
        join(cwd, ".f-mark", "agents", "ag-claude", "tmux-session"),
        "fmark-test-12345678-ag-ag-claude",
      );
      const g = globalPaths(cfg);
      const result = await runV04Migration(cwd, g);
      expect(result.movedAgents).toBe(true);
      const pathId = computePathId(cwd);
      const moved = join(g.projectAgentsDir(pathId), "ag-claude", "tmux-session");
      expect(existsSync(moved)).toBe(true);
      // Original is gone.
      expect(existsSync(join(cwd, ".f-mark", "agents"))).toBe(false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
      rmSync(cfg, { recursive: true, force: true });
    }
  });

  it("moves runtimes.json to projects/<pathId>/runtimes.json", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "fmark-mig-cwd-"));
    const cfg = mkdtempSync(join(tmpdir(), "fmark-mig-cfg-"));
    try {
      mkdirSync(join(cwd, ".f-mark"), { recursive: true });
      writeFileSync(
        join(cwd, ".f-mark", "runtimes.json"),
        JSON.stringify({ version: "1.0", runtimes: {} }),
      );
      const g = globalPaths(cfg);
      const result = await runV04Migration(cwd, g);
      expect(result.movedRuntimes).toBe(true);
      const pathId = computePathId(cwd);
      expect(existsSync(g.projectRuntimesFile(pathId))).toBe(true);
      expect(existsSync(join(cwd, ".f-mark", "runtimes.json"))).toBe(false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
      rmSync(cfg, { recursive: true, force: true });
    }
  });

  it("splits config.json: participants → per-path participants.json; version/port → global config.json", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "fmark-mig-cwd-"));
    const cfg = mkdtempSync(join(tmpdir(), "fmark-mig-cfg-"));
    try {
      mkdirSync(join(cwd, ".f-mark"), { recursive: true });
      writeFileSync(
        join(cwd, ".f-mark", "config.json"),
        JSON.stringify({
          version: "0.5.0",
          port: 9000,
          host: "localhost",
          participants: {
            "us-abc": { kind: "user", name: "Me", color: "#222222" },
          },
        }),
      );
      const g = globalPaths(cfg);
      const result = await runV04Migration(cwd, g);
      expect(result.splitConfig).toBe(true);

      const participants = JSON.parse(
        readFileSync(join(cwd, ".f-mark", "participants.json"), "utf8"),
      );
      expect(participants.participants["us-abc"].name).toBe("Me");

      const globalCfg = JSON.parse(readFileSync(g.configFile(), "utf8"));
      expect(globalCfg.version).toBe("0.5.0");
      expect(globalCfg.port).toBe(9000);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
      rmSync(cfg, { recursive: true, force: true });
    }
  });

  it("writes a path-pointer file under projects/<pathId>/path", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "fmark-mig-cwd-"));
    const cfg = mkdtempSync(join(tmpdir(), "fmark-mig-cfg-"));
    try {
      const g = globalPaths(cfg);
      const result = await runV04Migration(cwd, g);
      const pathId = result.pathId!;
      const ptr = readFileSync(g.projectPathFile(pathId), "utf8");
      expect(ptr).toBe(cwd);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
      rmSync(cfg, { recursive: true, force: true });
    }
  });

  it("is idempotent on second invocation (state.json now exists)", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "fmark-mig-cwd-"));
    const cfg = mkdtempSync(join(tmpdir(), "fmark-mig-cfg-"));
    try {
      const g = globalPaths(cfg);
      const first = await runV04Migration(cwd, g);
      expect(first.migrated).toBe(true);
      const second = await runV04Migration(cwd, g);
      expect(second.migrated).toBe(false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
      rmSync(cfg, { recursive: true, force: true });
    }
  });
});
