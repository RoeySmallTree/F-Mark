import { describe, expect, it } from "vitest";
import Fastify from "fastify";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerRuntimeRoutes } from "../../src/routes/runtimes.js";
import { initProject } from "../../src/project.js";
import { paths } from "../../src/paths.js";

async function makeApp() {
  const root = await mkdtemp(join(tmpdir(), "fmark-runtimes-r-"));
  const p = paths(root);
  await initProject(p);
  const app = Fastify();
  registerRuntimeRoutes(app, p);
  return {
    app,
    p,
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

describe("runtime routes", () => {
  it("GET /runtimes returns the built-in registry", async () => {
    const { app, cleanup } = await makeApp();
    try {
      const res = await app.inject({ method: "GET", url: "/runtimes" });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.runtimes.claude.displayName).toBe("Claude Code");
      expect(body.runtimes.codex.executable).toBe("codex");
      expect(body.runtimes.opencode.executable).toBe("opencode");
      expect(Object.keys(body.runtimes).sort()).toEqual([
        "claude",
        "codex",
        "opencode",
      ]);
    } finally {
      await cleanup();
    }
  });

  it("GET /runtimes hides historical Gemini entries without rewriting the file", async () => {
    const { app, p, cleanup } = await makeApp();
    try {
      await writeFile(
        join(p.fmarkDir(), "runtimes.json"),
        `${JSON.stringify({
          version: "1.0",
          runtimes: {
            claude: {
              displayName: "Claude Code",
              executable: "claude",
              args: [],
            },
            codex: {
              displayName: "Codex",
              executable: "codex",
              args: [],
            },
            opencode: {
              displayName: "Opencode",
              executable: "opencode",
              args: [],
            },
            gemini: {
              displayName: "Gemini",
              executable: "gemini",
              args: [],
            },
          },
        })}\n`,
        "utf8",
      );

      const res = await app.inject({ method: "GET", url: "/runtimes" });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.runtimes.gemini).toBeUndefined();
      expect(Object.keys(body.runtimes).sort()).toEqual([
        "claude",
        "codex",
        "opencode",
      ]);

      const raw = JSON.parse(
        await readFile(join(p.fmarkDir(), "runtimes.json"), "utf8"),
      ) as { runtimes: Record<string, unknown> };
      expect(raw.runtimes.gemini).toBeDefined();
    } finally {
      await cleanup();
    }
  });

  it("PUT /runtimes/gemini rejects re-adding the retired runtime", async () => {
    const { app, cleanup } = await makeApp();
    try {
      const res = await app.inject({
        method: "PUT",
        url: "/runtimes/gemini",
        payload: { displayName: "Gemini", executable: "gemini", args: [] },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toMatch(/no longer supported/i);
    } finally {
      await cleanup();
    }
  });

  it("PUT /runtimes/:id upserts a custom runtime", async () => {
    const { app, p, cleanup } = await makeApp();
    try {
      const res = await app.inject({
        method: "PUT",
        url: "/runtimes/my_bot",
        payload: {
          displayName: "My Bot",
          executable: "mybot",
          args: ["--quiet"],
          icon: "bot",
          readyDelayMs: 500,
        },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().runtimes.my_bot.displayName).toBe("My Bot");
      const raw = JSON.parse(
        await readFile(join(p.fmarkDir(), "runtimes.json"), "utf8"),
      ) as { runtimes: Record<string, { executable: string }> };
      expect(raw.runtimes.my_bot.executable).toBe("mybot");
    } finally {
      await cleanup();
    }
  });

  it("DELETE /runtimes/:id removes custom runtimes but refuses built-ins", async () => {
    const { app, cleanup } = await makeApp();
    try {
      await app.inject({
        method: "PUT",
        url: "/runtimes/mybot",
        payload: { displayName: "My Bot", executable: "mybot", args: [] },
      });
      const removed = await app.inject({
        method: "DELETE",
        url: "/runtimes/mybot",
      });
      expect(removed.statusCode).toBe(200);
      expect(removed.json().runtimes.mybot).toBeUndefined();

      const builtin = await app.inject({
        method: "DELETE",
        url: "/runtimes/claude",
      });
      expect(builtin.statusCode).toBe(400);
      expect(builtin.json().error).toMatch(/built-in/i);
    } finally {
      await cleanup();
    }
  });
});
