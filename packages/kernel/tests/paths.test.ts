import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { paths } from "../src/paths.js";

describe("paths", () => {
  const root = "/tmp/sample";
  const p = paths(root);

  it("computes the .f-mark dir", () => {
    expect(p.fmarkDir()).toBe(join(root, ".f-mark"));
  });

  it("computes config.json", () => {
    expect(p.configFile()).toBe(join(root, ".f-mark", "config.json"));
  });

  it("computes the sessions dir", () => {
    expect(p.sessionsDir()).toBe(join(root, ".f-mark", "sessions"));
  });

  it("computes a session dir by id", () => {
    expect(p.sessionDir("2026-05-22-untitled")).toBe(
      join(root, ".f-mark", "sessions", "2026-05-22-untitled"),
    );
  });

  it("computes the AGENT.md path", () => {
    expect(p.agentMd()).toBe(join(root, ".f-mark", "AGENT.md"));
  });

  it("computes the token path", () => {
    expect(p.tokenFile()).toBe(join(root, ".f-mark", ".token"));
  });
});
