import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile, readFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { tmpdir, homedir } from "node:os";
import {
  applyOpencodeHooks,
  detectOpencodeHooks,
  loadOpencodePluginFile,
  removeOpencodeHooks,
  renderOpencodeInstallSnippet,
  opencodePluginPath,
  FMARK_OPENCODE_PLUGIN_VERSION,
  type OpencodeHookScope,
} from "../../src/hooksInstall/opencode.js";

let tmp: string;

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), "fmark-oc-hook-"));
});
afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe("hooksInstall/opencode", () => {
  test("project plugin path resolves under .opencode/plugin/fmark.ts", () => {
    expect(opencodePluginPath("project", tmp)).toBe(join(tmp, ".opencode/plugin/fmark.ts"));
  });

  test("user plugin path resolves under ~/.config/opencode/plugin/fmark.ts", () => {
    expect(opencodePluginPath("user")).toBe(
      join(homedir(), ".config/opencode/plugin/fmark.ts"),
    );
  });

  test("project scope without projectRoot throws", () => {
    expect(() => opencodePluginPath("project")).toThrowError(/projectRoot/);
  });

  test("detect on empty project — missing", async () => {
    const result = await detectOpencodeHooks({ projectRoot: tmp });
    const project = result.locations?.find((l) => l.scope === "local");
    expect(project?.status).toBe("missing");
    expect(project?.configPath).toBe(join(tmp, ".opencode/plugin/fmark.ts"));
  });

  test("apply project: writes plugin + sidecar with sha256 + version", async () => {
    const applied = await applyOpencodeHooks({
      scope: "project" as OpencodeHookScope,
      projectRoot: tmp,
    });
    expect(applied.changed).toBe(true);
    expect(applied.configPath).toBe(join(tmp, ".opencode/plugin/fmark.ts"));

    const ts = await readFile(applied.configPath, "utf8");
    expect(ts).toContain("FmarkPlugin");
    expect(ts).toContain("opencode:always");
    expect(ts).toContain("scope: \"always\"");

    const metaPath = join(tmp, ".opencode/plugin/fmark.meta.json");
    const meta = JSON.parse(await readFile(metaPath, "utf8"));
    expect(meta.version).toBe(FMARK_OPENCODE_PLUGIN_VERSION);
    expect(meta.scope).toBe("project");
    expect(meta.installed_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(meta.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(meta.sha256).toBe(createHash("sha256").update(ts).digest("hex"));
  });

  test("apply is idempotent", async () => {
    await applyOpencodeHooks({ scope: "project", projectRoot: tmp });
    const second = await applyOpencodeHooks({ scope: "project", projectRoot: tmp });
    expect(second.changed).toBe(false);
  });

  test("detect after apply — installed", async () => {
    await applyOpencodeHooks({ scope: "project", projectRoot: tmp });
    const result = await detectOpencodeHooks({ projectRoot: tmp });
    const project = result.locations?.find((l) => l.scope === "local");
    expect(project?.status).toBe("installed");
    expect(project?.detectedVersion).toBe(FMARK_OPENCODE_PLUGIN_VERSION);
    expect(result.installed).toBe(true);
  });

  test("user-edited plugin → stale (sha256 mismatch)", async () => {
    await applyOpencodeHooks({ scope: "project", projectRoot: tmp });
    const p = join(tmp, ".opencode/plugin/fmark.ts");
    const orig = await readFile(p, "utf8");
    await writeFile(p, orig + "\nconsole.log('user edit');\n");
    const result = await detectOpencodeHooks({ projectRoot: tmp });
    const project = result.locations?.find((l) => l.scope === "local");
    expect(project?.status).toBe("stale");
  });

  test("ancient version → stale with detectedVersion captured", async () => {
    const dir = join(tmp, ".opencode/plugin");
    await mkdir(dir, { recursive: true });
    const fakeSource = "// from old install\n";
    await writeFile(join(dir, "fmark.ts"), fakeSource);
    await writeFile(
      join(dir, "fmark.meta.json"),
      JSON.stringify({
        version: "ancient-v0",
        sha256: createHash("sha256").update(fakeSource).digest("hex"),
        scope: "project",
        installed_at: "2024-01-01T00:00:00Z",
      }),
    );
    const result = await detectOpencodeHooks({ projectRoot: tmp });
    const project = result.locations?.find((l) => l.scope === "local");
    expect(project?.status).toBe("stale");
    expect(project?.detectedVersion).toBe("ancient-v0");
  });

  test("missing sidecar → stale even when file matches template", async () => {
    await applyOpencodeHooks({ scope: "project", projectRoot: tmp });
    await rm(join(tmp, ".opencode/plugin/fmark.meta.json"));
    const result = await detectOpencodeHooks({ projectRoot: tmp });
    const project = result.locations?.find((l) => l.scope === "local");
    expect(project?.status).toBe("stale");
  });

  test("loadOpencodePluginFile reads the file when present", async () => {
    await applyOpencodeHooks({ scope: "project", projectRoot: tmp });
    const { source, configPath } = await loadOpencodePluginFile({
      scope: "project",
      projectRoot: tmp,
    });
    expect(configPath).toBe(join(tmp, ".opencode/plugin/fmark.ts"));
    expect(source).toContain("FmarkPlugin");
  });

  test("loadOpencodePluginFile returns null source when missing", async () => {
    const { source } = await loadOpencodePluginFile({ scope: "project", projectRoot: tmp });
    expect(source).toBeNull();
  });

  test("render snippet contains FmarkPlugin + version", () => {
    const snippet = renderOpencodeInstallSnippet();
    expect(snippet).toContain("FmarkPlugin");
    expect(snippet).toContain(FMARK_OPENCODE_PLUGIN_VERSION);
  });

  test("detect with no projectRoot returns only user location", async () => {
    const result = await detectOpencodeHooks({});
    expect(result.locations?.length).toBe(1);
    expect(result.locations?.[0]?.scope).toBe("global");
  });

  test("apply creates the .opencode/plugin/ directory", async () => {
    await expect(stat(join(tmp, ".opencode"))).rejects.toBeTruthy();
    await applyOpencodeHooks({ scope: "project", projectRoot: tmp });
    const dirStat = await stat(join(tmp, ".opencode/plugin"));
    expect(dirStat.isDirectory()).toBe(true);
  });

  test("remove deletes the plugin and sidecar when present", async () => {
    const applied = await applyOpencodeHooks({ scope: "project", projectRoot: tmp });
    const sidecar = join(tmp, ".opencode/plugin/fmark.meta.json");

    const removed = await removeOpencodeHooks({ scope: "project", projectRoot: tmp });

    expect(removed).toEqual({ changed: true, configPath: applied.configPath });
    await expect(readFile(applied.configPath, "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(readFile(sidecar, "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  test("remove is a no-op when plugin and sidecar are absent", async () => {
    await expect(
      removeOpencodeHooks({ scope: "project", projectRoot: tmp }),
    ).resolves.toEqual({
      changed: false,
      configPath: join(tmp, ".opencode/plugin/fmark.ts"),
    });
  });
});
