import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { globalPaths, resolveConfigRoot } from "../../src/paths/global.js";

describe("globalPaths", () => {
  const root = "/tmp/sample-fmark-config";
  const g = globalPaths(root);

  it("resolves the config dir to the root", () => {
    expect(g.configDir()).toBe(root);
  });

  it("computes the token file", () => {
    expect(g.tokenFile()).toBe(join(root, ".token"));
  });

  it("computes state.json", () => {
    expect(g.stateFile()).toBe(join(root, "state.json"));
  });

  it("computes the default runtimes file", () => {
    expect(g.defaultRuntimesFile()).toBe(join(root, "runtimes.json"));
  });

  it("computes the projects dir", () => {
    expect(g.projectsDir()).toBe(join(root, "projects"));
  });

  it("computes a project dir by pathId", () => {
    expect(g.projectDir("abc123def456")).toBe(
      join(root, "projects", "abc123def456"),
    );
  });

  it("computes the project path-pointer file", () => {
    expect(g.projectPathFile("abc123def456")).toBe(
      join(root, "projects", "abc123def456", "path"),
    );
  });

  it("computes a project's agent dir", () => {
    expect(g.projectAgentDir("abc123def456", "ag-12ab")).toBe(
      join(root, "projects", "abc123def456", "agents", "ag-12ab"),
    );
  });
});

describe("resolveConfigRoot", () => {
  it("honors XDG_CONFIG_HOME when set", () => {
    const env = { XDG_CONFIG_HOME: "/srv/xdg" } as NodeJS.ProcessEnv;
    expect(resolveConfigRoot(env)).toBe("/srv/xdg/f-mark");
  });

  it("falls back to ~/.config when XDG_CONFIG_HOME is empty", () => {
    const env = { XDG_CONFIG_HOME: "" } as NodeJS.ProcessEnv;
    const resolved = resolveConfigRoot(env);
    expect(resolved.endsWith("/.config/f-mark")).toBe(true);
  });

  it("falls back to ~/.config when XDG_CONFIG_HOME is unset", () => {
    const env = {} as NodeJS.ProcessEnv;
    const resolved = resolveConfigRoot(env);
    expect(resolved.endsWith("/.config/f-mark")).toBe(true);
  });
});
