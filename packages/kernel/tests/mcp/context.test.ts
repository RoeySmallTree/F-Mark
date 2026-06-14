import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { writeActiveSession } from "../../src/agents/activeSession.js";
import {
  resolveFmarkMcpContext,
  resolveSessionContext,
  resolveWriteContext,
} from "../../src/mcp/context.js";
import { paths } from "../../src/paths.js";
import { initProject } from "../../src/project.js";
import { createSession } from "../../src/sessions.js";
import { withTempProject } from "../helpers/tempdir.js";

async function setupProject(root: string, port = 7654) {
  const p = paths(root);
  await initProject(p, port);
  return p;
}

describe("MCP context resolution", () => {
  it("resolves explicit project path, kernel URL, and token", async () => {
    await withTempProject(async (root) => {
      const p = await setupProject(root, 2468);
      await writeFile(p.tokenFile(), "secret-token\n");

      const ctx = await resolveFmarkMcpContext({
        path: root,
        env: {},
      });

      expect(ctx.projectRoot).toBe(root);
      expect(ctx.fmarkDir).toBe(p.fmarkDir());
      expect(ctx.kernelUrl).toBe("http://localhost:2468");
      expect(ctx.token).toBe("secret-token");
    });
  });

  it("prefers explicit session_id over linked agent and env fallback", async () => {
    await withTempProject(async (root) => {
      const p = await setupProject(root);
      await writeActiveSession(
        join(p.fmarkDir(), "agents"),
        "ag-phase5",
        "linked-session",
      );

      const ctx = await resolveSessionContext(
        { session_id: "explicit-session", participant_id: "ag-phase5" },
        {
          path: root,
          env: { F_MARK_SESSION_ID: "env-session" },
        },
      );

      expect(ctx.sessionId).toBe("explicit-session");
      expect(ctx.participantId).toBe("ag-phase5");
    });
  });

  it("falls back to linked active session, then F_MARK_SESSION_ID", async () => {
    await withTempProject(async (root) => {
      const p = await setupProject(root);
      await writeActiveSession(
        join(p.fmarkDir(), "agents"),
        "ag-phase5",
        "linked-session",
      );

      const linked = await resolveSessionContext(
        { participant_id: "ag-phase5" },
        {
          path: root,
          env: { F_MARK_SESSION_ID: "env-session" },
        },
      );
      expect(linked.sessionId).toBe("linked-session");

      const envOnly = await resolveSessionContext(
        {},
        {
          path: root,
          env: { F_MARK_SESSION_ID: "env-session" },
        },
      );
      expect(envOnly.sessionId).toBe("env-session");
    });
  });

  it("requires a participant for write context", async () => {
    await withTempProject(async (root) => {
      await setupProject(root);
      await expect(
        resolveWriteContext(
          { session_id: "session-without-agent" },
          {
            path: root,
            env: {},
          },
        ),
      ).rejects.toThrow("participant_id is required");
    });
  });

  it("rejects writes to a missing session", async () => {
    await withTempProject(async (root) => {
      await setupProject(root);
      await expect(
        resolveWriteContext(
          { session_id: "missing-session", participant_id: "ag-phase5" },
          {
            path: root,
            env: {},
          },
        ),
      ).rejects.toThrow("session not found: missing-session");
    });
  });

  it("rejects explicit write session that disagrees with the linked agent session", async () => {
    await withTempProject(async (root) => {
      const p = await setupProject(root);
      const source = await createSession(p, { slug: "source" });
      const other = await createSession(p, { slug: "other" });
      await writeActiveSession(
        join(p.fmarkDir(), "agents"),
        "ag-phase5",
        source.id,
      );

      await expect(
        resolveWriteContext(
          { session_id: other.id, participant_id: "ag-phase5" },
          {
            path: root,
            env: {},
          },
        ),
      ).rejects.toThrow("does not match active session");
    });
  });

  it("discovers .f-mark from cwd when no explicit path is provided", async () => {
    await withTempProject(async (root) => {
      const p = await setupProject(root);
      const nested = join(root, "nested", "child");
      await mkdir(nested, { recursive: true });

      const ctx = await resolveFmarkMcpContext({
        cwd: nested,
        env: {},
      });

      expect(ctx.projectRoot).toBe(root);
      expect(ctx.fmarkDir).toBe(p.fmarkDir());
    });
  });
});
