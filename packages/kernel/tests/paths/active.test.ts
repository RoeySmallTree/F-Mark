import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { activePaths } from "../../src/paths/active.js";

describe("activePaths", () => {
  const root = "/tmp/sample-project";
  const a = activePaths(root);

  it("returns the root", () => {
    expect(a.root()).toBe(root);
  });

  it("computes a stable 12-char pathId", () => {
    expect(a.pathId()).toMatch(/^[0-9a-f]{12}$/);
    // Stable across invocations.
    expect(activePaths(root).pathId()).toBe(a.pathId());
  });

  it("computes the .f-mark dir", () => {
    expect(a.fmarkDir()).toBe(join(root, ".f-mark"));
  });

  it("computes the sessions dir", () => {
    expect(a.sessionsDir()).toBe(join(root, ".f-mark", "sessions"));
  });

  it("computes a session dir by id", () => {
    expect(a.sessionDir("2026-05-24-foo")).toBe(
      join(root, ".f-mark", "sessions", "2026-05-24-foo"),
    );
  });

  it("computes the participants file", () => {
    expect(a.participantsFile()).toBe(
      join(root, ".f-mark", "participants.json"),
    );
  });

  it("computes the AGENT.md path", () => {
    expect(a.agentMd()).toBe(join(root, ".f-mark", "AGENT.md"));
  });
});
