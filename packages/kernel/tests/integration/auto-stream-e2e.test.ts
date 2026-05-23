import { describe, it, expect } from "vitest";
import { writeFile, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { createServer } from "../../src/server.js";
import { initProject, readConfig, writeConfig } from "../../src/project.js";
import { paths, type Paths } from "../../src/paths.js";
import { createSession } from "../../src/sessions.js";
import { registerAgent } from "../../src/participants.js";
import { writeActiveSession } from "../../src/agents/activeSession.js";
import { runAutoStream } from "../../src/hooks/autoStream.js";
import type { FastifyInstance } from "fastify";

const TOKEN = "tok-int-e2e";

interface Harness {
  p: Paths;
  app: FastifyInstance;
  port: number;
  sessionId: string;
  pid: string;
}

/**
 * Bootstraps a tmp project + Fastify kernel listening on a random port,
 * with config.json pointing at that port so loadHookContext + runAutoStream
 * can talk to the in-process server via real HTTP.
 */
async function setup(root: string): Promise<Harness> {
  const p = paths(root);
  await initProject(p);

  // Persist the token alongside config so hook bootstrap finds it.
  await writeFile(p.tokenFile(), TOKEN, "utf8");

  // Register the agent participant; this becomes the speaker for the turn.
  const agent = await registerAgent(p, {
    name: "Claude",
    suggested_id: "ag-claude",
  });

  // Create a session that we will link the agent to.
  const session = await createSession(p, { slug: "e2e" });

  // Start the kernel and bind to a random port (port 0 = OS-assigned).
  const { app } = createServer({ token: TOKEN, paths: p });
  await app.listen({ host: "127.0.0.1", port: 0 });
  const addr = app.server.address();
  if (addr === null || typeof addr === "string") {
    throw new Error("kernel failed to bind to a TCP port");
  }
  const port = addr.port;

  // Patch config.json so loadHookContext resolves to the listening port.
  const cfg = await readConfig(p);
  cfg.port = port;
  await writeConfig(p, cfg);

  return { p, app, port, sessionId: session.id, pid: agent.id };
}

describe("auto-stream end-to-end", () => {
  it("posts arbitrary prose + tool-use + concluding prose + turn-end for a multi-block turn", async () => {
    // We manage the tmp project lifecycle manually here so we can close the
    // server *before* the directory is removed.
    const { mkdtemp, rm } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const root = await mkdtemp(join(tmpdir(), "fmark-int-"));
    let app: FastifyInstance | undefined;
    try {
      const h = await setup(root);
      app = h.app;
      const { p, sessionId, pid } = h;

      // Link the agent to the session via the kernel HTTP API.
      const linkRes = await fetch(
        `http://127.0.0.1:${h.port}/agents/${pid}/link`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${TOKEN}`,
          },
          body: JSON.stringify({ session_id: sessionId }),
        },
      );
      expect(linkRes.status).toBe(200);

      // Write a fake JSONL transcript with text + tool_use + tool_result + text.
      // The shape mirrors Claude Code's hook transcript_path payload.
      const transcript = join(root, "transcript.jsonl");
      const lines = [
        JSON.stringify({
          role: "user",
          content: [{ type: "text", text: "list files" }],
        }),
        JSON.stringify({
          role: "assistant",
          content: [
            { type: "text", text: "I'll search for files." },
            {
              type: "tool_use",
              id: "tu_e2e",
              name: "Bash",
              input: { command: "ls" },
            },
          ],
        }),
        JSON.stringify({
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "tu_e2e",
              content: "a.txt\nb.txt",
            },
          ],
        }),
        JSON.stringify({
          role: "assistant",
          content: [{ type: "text", text: "Found a.txt and b.txt." }],
        }),
      ];
      await writeFile(transcript, lines.join("\n"), "utf8");

      // Invoke the hook entry point exactly as the CLI would, with stdin JSON.
      const exit = await runAutoStream(
        pid,
        "assistant",
        JSON.stringify({
          session_id: "claude-session-1",
          transcript_path: transcript,
          cwd: root,
          hook_event_name: "Stop",
          stop_hook_active: false,
        }),
      );
      expect(exit).toBe(0);

      // Inspect the session folder. Expect:
      //   - 1 arbitrary prose file ("I'll search for files.")
      //   - 1 tool-use file (Bash)
      //   - 1 concluding prose file ("Found a.txt and b.txt.")
      //   - 1 turn-end file
      const sessionDir = p.sessionDir(sessionId);
      const files = await readdir(sessionDir);
      const proseFiles = files.filter((f) => f.endsWith(".prose.md")).sort();
      const toolUseFiles = files.filter((f) => f.endsWith(".tool-use.json"));
      const turnEndFiles = files.filter((f) => f.endsWith(".turn-end.json"));

      expect(proseFiles).toHaveLength(2);
      expect(toolUseFiles).toHaveLength(1);
      expect(turnEndFiles).toHaveLength(1);

      // Files are timestamp-prefixed, sorted ascending == chronological order.
      const [firstProseFile, secondProseFile] = proseFiles;
      const firstProse = await readFile(
        join(sessionDir, firstProseFile!),
        "utf8",
      );
      const secondProse = await readFile(
        join(sessionDir, secondProseFile!),
        "utf8",
      );
      // Arbitrary prose gets `arbitrary: true` frontmatter (see prose.ts).
      expect(firstProse).toContain("arbitrary: true");
      expect(firstProse).toContain("I'll search for files.");
      // Concluding prose has no frontmatter — pure markdown body.
      expect(secondProse).not.toContain("arbitrary");
      expect(secondProse).toContain("Found a.txt and b.txt.");

      // Tool-use file is JSON; verify the shape from serializeToolUse.
      const toolUseRaw = await readFile(
        join(sessionDir, toolUseFiles[0]!),
        "utf8",
      );
      const toolUse = JSON.parse(toolUseRaw) as Record<string, unknown>;
      expect(toolUse.tool_name).toBe("Bash");
      expect(toolUse.tool_use_id).toBe("tu_e2e");
      expect(toolUse.success).toBe(true);
      expect(toolUse.result).toBe("a.txt\nb.txt");

      // Sanity-check the turn-end content carries the participant id.
      const turnEndRaw = await readFile(
        join(sessionDir, turnEndFiles[0]!),
        "utf8",
      );
      const turnEnd = JSON.parse(turnEndRaw) as Record<string, unknown>;
      expect(turnEnd.participant_id).toBe(pid);
    } finally {
      if (app) await app.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it("skips when stop_hook_active=true (no events written)", async () => {
    const { mkdtemp, rm } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const root = await mkdtemp(join(tmpdir(), "fmark-int-"));
    let app: FastifyInstance | undefined;
    try {
      const h = await setup(root);
      app = h.app;
      const { p, sessionId, pid } = h;

      // Link agent → session directly via the active-session pointer (skip the
      // HTTP path; the previous test already exercises /agents/:id/link).
      await writeActiveSession(p.fmarkDir(), pid, sessionId);

      const transcript = join(root, "t.jsonl");
      await writeFile(
        transcript,
        JSON.stringify({
          role: "assistant",
          content: [{ type: "text", text: "hi" }],
        }),
        "utf8",
      );

      const exit = await runAutoStream(
        pid,
        "assistant",
        JSON.stringify({
          session_id: "claude-x",
          transcript_path: transcript,
          cwd: root,
          hook_event_name: "Stop",
          stop_hook_active: true,
        }),
      );
      expect(exit).toBe(0);

      // No event files should have been written by the hook. Filter to known
      // event suffixes so we ignore any housekeeping files the session dir
      // might gain in future.
      const sessionDir = p.sessionDir(sessionId);
      const files = await readdir(sessionDir);
      const eventFiles = files.filter((f) =>
        /\.(prose|tool-use|turn-end|choices|choice|todo|html|file)\./.test(f),
      );
      expect(eventFiles).toHaveLength(0);
    } finally {
      if (app) await app.close();
      await rm(root, { recursive: true, force: true });
    }
  });
});
