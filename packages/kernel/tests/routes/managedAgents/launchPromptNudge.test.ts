import { describe, expect, it } from "vitest";
import { buildLaunchPrompt } from "../../../src/routes/managedAgents/launchService.js";

function prompt(sessionId: string | undefined, sessionSlug?: string): string {
  return buildLaunchPrompt({
    sessionId,
    sessionSlug,
    participantId: "ag-claude",
    userParticipantId: "us-roey",
    runtimeId: "claude",
    projectRoot: "/tmp/project",
    mcpStatus: "installed",
    hooksStatus: "installed",
  });
}

/* The guide body always documents session naming; the launch-specific brief
   ("still has its placeholder name") only appears while the session is
   actually placeholder-named. Placeholder state lives in the meta SLUG —
   the id is immutable and carries no name. */
const NUDGE = "still has its placeholder name";

describe("launch prompt session-naming nudge", () => {
  it("tells the agent to rename a placeholder-named session", () => {
    const text = prompt("2026-07-04-1a2b3c", "new-session");
    expect(text).toContain(NUDGE);
    expect(text).toContain("fmark_rename_session");
  });

  it("also covers collision-suffixed placeholders", () => {
    expect(prompt("2026-07-04-9f8e7d", "new-session-2")).toContain(NUDGE);
  });

  it("omits the nudge for named sessions and sessionless launches", () => {
    expect(prompt("2026-07-04-fix-login-flow", "fix-login-flow")).not.toContain(NUDGE);
    expect(prompt(undefined)).not.toContain(NUDGE);
  });
});

describe("launch prompt design-target policy", () => {
  it("pins the renamed renderer-theme fields and the session-artifact Amber default", () => {
    const text = prompt(undefined);
    expect(text).toContain('"renderer_current_theme"');
    expect(text).toContain('"renderer_theme_source"');
    expect(text).toContain('"design_target_policy"');
    expect(text).toContain('"session_artifact_theme_default": "amber"');
    /* the policy value states F-Mark is delivery chrome, not design authority */
    expect(text).toContain("delivery surface only");
  });

  it("drops the old active_theme key that read as design authority", () => {
    /* active_theme sounded like design authority and nudged agents into using
       the applied F-Mark theme as the palette — renamed to renderer_current_theme. */
    expect(prompt(undefined)).not.toContain('"active_theme"');
    expect(prompt("2026-07-04-fix-login-flow", "fix-login-flow")).not.toContain(
      '"active_theme"',
    );
  });
});
