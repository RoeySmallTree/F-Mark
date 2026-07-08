import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { globalPaths } from "../../src/paths/global.js";
import {
  readGlobalConfig,
  updateGlobalConfig,
  writeGlobalConfig,
} from "../../src/state/globalConfig.js";

describe("global config store", () => {
  it("returns an empty object when config.json is missing", async () => {
    const root = mkdtempSync(join(tmpdir(), "fmark-global-config-"));
    try {
      await expect(readGlobalConfig(globalPaths(root))).resolves.toEqual({});
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("preserves unknown keys during updates", async () => {
    const root = mkdtempSync(join(tmpdir(), "fmark-global-config-"));
    try {
      const g = globalPaths(root);
      await writeGlobalConfig(g, {
        version: "0.4.0",
        port: 7777,
        custom: { keep: true },
      });

      const next = await updateGlobalConfig(g, (config) => ({
        ...config,
        allSessionEvents: { schema: 1, cursors: {} },
      }));

      expect(next.version).toBe("0.4.0");
      expect(next.port).toBe(7777);
      expect(next.custom).toEqual({ keep: true });
      await expect(readGlobalConfig(g)).resolves.toMatchObject({
        custom: { keep: true },
        allSessionEvents: { schema: 1 },
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("serializes concurrent updates", async () => {
    const root = mkdtempSync(join(tmpdir(), "fmark-global-config-"));
    try {
      const g = globalPaths(root);
      await Promise.all(
        Array.from({ length: 12 }, () =>
          updateGlobalConfig(g, (config) => ({
            ...config,
            counter:
              typeof config.counter === "number" ? config.counter + 1 : 1,
          })),
        ),
      );

      await expect(readGlobalConfig(g)).resolves.toMatchObject({ counter: 12 });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects malformed JSON", async () => {
    const root = mkdtempSync(join(tmpdir(), "fmark-global-config-"));
    try {
      const g = globalPaths(root);
      writeFileSync(g.configFile(), "{not-json", "utf8");
      await expect(readGlobalConfig(g)).rejects.toThrow();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
