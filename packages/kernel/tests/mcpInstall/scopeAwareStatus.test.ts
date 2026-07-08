import { describe, expect, it } from "vitest";
import type { IntegrationLocation } from "@f-mark/shared";
import { summarizeHookStatusForScope } from "../../src/mcpInstall/index.js";

function location(
  scope: IntegrationLocation["scope"],
  status: IntegrationLocation["status"],
): IntegrationLocation {
  return {
    scope,
    path: `/tmp/${scope}-${status}`,
    status,
    safe_auto_apply: true,
  };
}

describe("summarizeHookStatusForScope", () => {
  it("reports the chosen scope as missing even when another scope is installed", () => {
    expect(
      summarizeHookStatusForScope(
        [location("project", "missing"), location("user", "installed")],
        "project",
        "claude",
      ),
    ).toBe("missing");
  });

  it("reports installed when the chosen scope is installed", () => {
    expect(
      summarizeHookStatusForScope(
        [location("project", "missing"), location("user", "installed")],
        "user",
        "opencode",
      ),
    ).toBe("installed");
  });

  it("falls back to aggregate status when no chosen scope is provided", () => {
    expect(
      summarizeHookStatusForScope(
        [location("project", "missing"), location("user", "installed")],
        undefined,
        "claude",
      ),
    ).toBe("installed");
  });

  it("normalizes Codex to the user/global location", () => {
    expect(
      summarizeHookStatusForScope(
        [location("project", "missing"), location("user", "installed")],
        "project",
        "codex",
      ),
    ).toBe("installed");
  });
});
