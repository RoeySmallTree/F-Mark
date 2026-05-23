import { describe, it, expect, vi, beforeEach } from "vitest";
import { mkdtemp, mkdir, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { runAutoStream } from "../../src/hooks/autoStream.js";
import { writeActiveSession } from "../../src/agents/activeSession.js";

async function bootstrapProject() {
  const dir = await mkdtemp(join(tmpdir(), "fm-"));
  const fmark = join(dir, ".f-mark");
  await mkdir(fmark, { recursive: true });
  await writeFile(join(fmark, ".token"), "tok-1", "utf8");
  await writeFile(
    join(fmark, "config.json"),
    JSON.stringify({ version: "0.1.0", port: 7777, participants: {} }),
    "utf8",
  );
  await writeActiveSession(fmark, "ag-claude", "sess-1");
  const transcript = join(dir, "transcript.jsonl");
  await writeFile(
    transcript,
    [
      JSON.stringify({ role: "user", content: [{ type: "text", text: "hi" }] }),
      JSON.stringify({ role: "assistant", content: [{ type: "text", text: "hello!" }] }),
    ].join("\n"),
    "utf8",
  );
  return { dir, fmark, transcript };
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
});

describe("runAutoStream(assistant)", () => {
  it("posts a concluding prose + turn-end for a one-message turn", async () => {
    const { dir, transcript } = await bootstrapProject();
    const stdin = {
      session_id: "claude-1",
      transcript_path: transcript,
      cwd: dir,
      hook_event_name: "Stop",
      stop_hook_active: false,
    };
    const exit = await runAutoStream("ag-claude", "assistant", JSON.stringify(stdin));
    expect(exit).toBe(0);
    const f = (globalThis.fetch as any) as ReturnType<typeof vi.fn>;
    expect(f).toHaveBeenCalledTimes(2);
    expect(f.mock.calls[0][0]).toContain("/sessions/sess-1/events/prose");
    expect(JSON.parse(f.mock.calls[0][1].body)).toMatchObject({ arbitrary: false, content: "hello!" });
    expect(f.mock.calls[1][0]).toContain("/sessions/sess-1/events/turn-end");
  });

  it("short-circuits when stop_hook_active=true", async () => {
    const { dir, transcript } = await bootstrapProject();
    const stdin = {
      session_id: "claude-1",
      transcript_path: transcript,
      cwd: dir,
      hook_event_name: "Stop",
      stop_hook_active: true,
    };
    const exit = await runAutoStream("ag-claude", "assistant", JSON.stringify(stdin));
    expect(exit).toBe(0);
    expect((globalThis.fetch as any)).not.toHaveBeenCalled();
  });

  it("exits 0 with stderr warning when no active-session pointer exists", async () => {
    const { dir, transcript } = await bootstrapProject();
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const exit = await runAutoStream("ag-unknown", "assistant", JSON.stringify({
      session_id: "claude-1",
      transcript_path: transcript,
      cwd: dir,
      hook_event_name: "Stop",
      stop_hook_active: false,
    }));
    expect(exit).toBe(0);
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining("no active session"));
    expect((globalThis.fetch as any)).not.toHaveBeenCalled();
    stderr.mockRestore();
  });
});

describe("runAutoStream(user)", () => {
  it("posts user prompt as non-arbitrary prose, no turn-end", async () => {
    const { dir } = await bootstrapProject();
    const stdin = {
      cwd: dir,
      hook_event_name: "UserPromptSubmit",
      prompt: "rerun the suite please",
    };
    await writeActiveSession(join(dir, ".f-mark"), "us-roey", "sess-1");
    const exit = await runAutoStream("us-roey", "user", JSON.stringify(stdin));
    expect(exit).toBe(0);
    const f = (globalThis.fetch as any) as ReturnType<typeof vi.fn>;
    expect(f).toHaveBeenCalledTimes(1);
    expect(f.mock.calls[0][0]).toContain("/events/prose");
    expect(JSON.parse(f.mock.calls[0][1].body)).toMatchObject({
      content: "rerun the suite please",
      arbitrary: false,
    });
  });
});
