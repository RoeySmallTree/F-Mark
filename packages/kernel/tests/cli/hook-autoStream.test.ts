import { describe, it, expect, vi } from "vitest";

describe("CLI: f-mark hook auto-stream", () => {
  it("invokes runAutoStream with the participant_id arg and kind default=assistant", async () => {
    const mod = await import("../../src/hooks/autoStream.js");
    const spy = vi.spyOn(mod, "runAutoStream").mockResolvedValue(0);
    const { runCli } = await import("../../src/cli.js");
    await runCli(["hook", "auto-stream", "ag-claude"], { stdin: '{"cwd":"/tmp"}' });
    expect(spy).toHaveBeenCalledWith("ag-claude", "assistant", '{"cwd":"/tmp"}');
    spy.mockRestore();
  });

  it("supports --kind user", async () => {
    const mod = await import("../../src/hooks/autoStream.js");
    const spy = vi.spyOn(mod, "runAutoStream").mockResolvedValue(0);
    const { runCli } = await import("../../src/cli.js");
    await runCli(["hook", "auto-stream", "us-roey", "--kind", "user"], { stdin: '{"prompt":"hi"}' });
    expect(spy).toHaveBeenCalledWith("us-roey", "user", '{"prompt":"hi"}');
    spy.mockRestore();
  });

  it("exits with code 2 when participant_id is missing", async () => {
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const { runCli } = await import("../../src/cli.js");
    const exit = await runCli(["hook", "auto-stream"], { stdin: "{}" });
    expect(exit).toBe(2);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("usage"));
    stderrSpy.mockRestore();
  });
});
