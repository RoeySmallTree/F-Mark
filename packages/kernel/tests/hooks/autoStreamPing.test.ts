import { describe, expect, it, vi, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeActiveSession } from "../../src/agents/activeSession.js";
import { runAutoStream } from "../../src/hooks/autoStream.js";

describe("runAutoStream pings presence", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  afterEach(() => { fetchSpy?.mockRestore(); });

  it("POSTs /agents/:id/ping before posting events", async () => {
    const root = await mkdtemp(join(tmpdir(), "fmark-ping-"));
    try {
      const fmarkDir = join(root, ".f-mark");
      await mkdir(fmarkDir, { recursive: true });
      await writeFile(join(fmarkDir, ".token"), "tok");
      await writeFile(join(fmarkDir, "config.json"), JSON.stringify({ port: 7777 }));
      await writeActiveSession(fmarkDir, "ag-claude", "sess-1");

      const calls: string[] = [];
      fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
        calls.push(url.toString());
        return new Response(null, { status: 204 });
      });

      const transcriptPath = join(root, "transcript.jsonl");
      await writeFile(transcriptPath, "");
      const stdin = JSON.stringify({
        session_id: "x",
        transcript_path: transcriptPath,
        cwd: root,
        hook_event_name: "Stop",
      });
      await runAutoStream("ag-claude", "assistant", stdin);

      const pingCalls = calls.filter((u) => u.includes("/agents/ag-claude/ping"));
      expect(pingCalls.length).toBeGreaterThanOrEqual(1);
      const pingIdx = calls.findIndex((u) => u.includes("/ping"));
      const otherIdx = calls.findIndex((u, i) => i > pingIdx && !u.includes("/ping"));
      // Either ping is the only call (empty transcript → no event posts) OR ping precedes the others.
      if (otherIdx !== -1) expect(pingIdx).toBeLessThan(otherIdx);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
