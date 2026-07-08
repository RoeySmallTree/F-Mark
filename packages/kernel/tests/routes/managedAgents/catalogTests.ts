import { expect, it } from "vitest";
import { join } from "node:path";
import { writeLaunchDefaults } from "../../../src/mcpInstall/scopePreference.js";
import { globalPaths, resolveConfigRoot } from "../../../src/paths/global.js";
import { makeApp } from "./fixtures.js";

export function registerRuntimeCatalogTests(): void {
  it(
    "returns runtime models with remembered launch defaults without resolving a participant",
    returnsModelsWithDefaults,
  );
  it("returns runtime efforts for a requested model", returnsEffortsForModel);
  it("rejects unknown runtime catalog requests", rejectsUnknownRuntime);
}

async function returnsModelsWithDefaults(): Promise<void> {
  const { app, root, cleanup } = await makeApp();
  const g = testGlobalPaths(root);
  await writeLaunchDefaults(
    "claude",
    {
      model: "fable",
      effort: "high",
      access_mode: "plan",
    },
    g,
  );

  const res = await app.inject({
    method: "GET",
    url: "/runtimes/claude/models?refresh=1",
  });

  expect(res.statusCode).toBe(200);
  expect(res.json()).toMatchObject({
    default_model: "fable",
    default_effort: "high",
    default_access_mode: "plan",
  });
  expect(res.json().models).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: "fable" }),
    ]),
  );
  expect(res.json().models).not.toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: "claude-opus-4-7" }),
    ]),
  );
  await app.close();
  await cleanup();
}

async function returnsEffortsForModel(): Promise<void> {
  const { app, cleanup } = await makeApp();
  const res = await app.inject({
    method: "GET",
    url: "/runtimes/claude/efforts?model=fable",
  });

  expect(res.statusCode).toBe(200);
  expect(res.json().efforts).toEqual(
    expect.arrayContaining([expect.objectContaining({ id: "high" })]),
  );
  await app.close();
  await cleanup();
}

async function rejectsUnknownRuntime(): Promise<void> {
  const { app, cleanup } = await makeApp();
  const res = await app.inject({
    method: "GET",
    url: "/runtimes/nope/models",
  });

  expect(res.statusCode).toBe(400);
  expect(res.json().error).toContain("runtime has no adapter: nope");
  await app.close();
  await cleanup();
}

function testGlobalPaths(root: string) {
  return globalPaths(
    resolveConfigRoot({
      ...process.env,
      HOME: join(root, "home"),
    }),
  );
}
