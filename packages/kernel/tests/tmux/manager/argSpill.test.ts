import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { materializeOversizedArgs } from "../../../src/tmux/manager/sessionLauncher.js";

const execFileAsync = promisify(execFile);

/* The launch packet (guide + recent-events brief) grows without bound and
   blew tmux's ~16 KB command limit ("command too long" spawn 500s). These
   tests pin the spill contract: small commands pass through untouched;
   large ones become a short `sh -c` wrapper whose pane-shell expansion
   reconstructs the original argv exactly. */
describe("materializeOversizedArgs", () => {
  let spillDir: string;

  beforeEach(async () => {
    spillDir = await mkdtemp(join(tmpdir(), "fmark-argspill-"));
  });

  afterEach(async () => {
    await rm(spillDir, { recursive: true, force: true });
  });

  it("passes small commands through untouched", async () => {
    const out = await materializeOversizedArgs({
      executable: "claude",
      args: ["--model", "sonnet", "short prompt"],
      spillDir,
    });
    expect(out).toEqual({
      executable: "claude",
      args: ["--model", "sonnet", "short prompt"],
    });
  });

  it("spills oversized args to files and wraps with sh -c", async () => {
    const bigPrompt = `# Launch packet\n${"x".repeat(20_000)}\nend`;
    const out = await materializeOversizedArgs({
      executable: "claude",
      args: ["--model", "opus", bigPrompt],
      spillDir,
    });
    expect(out.executable).toBe("/bin/sh");
    expect(out.args[0]).toBe("-c");
    const script = out.args[1]!;
    expect(script.startsWith("exec 'claude' '--model' 'opus' ")).toBe(true);
    expect(script.length).toBeLessThan(1024);
    expect(await readFile(join(spillDir, "arg-0.txt"), "utf8")).toBe(bigPrompt);
  });

  it("shell expansion reconstructs the original argv byte-for-byte", async () => {
    const { writeFile, chmod } = await import("node:fs/promises");
    const dumper = join(spillDir, "dump-argv.sh");
    await writeFile(
      dumper,
      `#!/bin/sh\nfor a in "$@"; do printf '%s\\0' "$a"; done\n`,
      "utf8",
    );
    await chmod(dumper, 0o755);

    const nasty = [
      "--flag",
      `it's got 'quotes', "doubles", $vars, \`backticks\` and\nnewlines ${"y".repeat(9_000)}`,
      `tail 'arg' with $HOME and ${"z".repeat(3_000)}`,
    ];
    const out = await materializeOversizedArgs({
      executable: dumper,
      args: nasty,
      spillDir,
    });
    expect(out.executable).toBe("/bin/sh");
    const { stdout } = await execFileAsync(out.executable, out.args);
    const received = stdout.split("\x00").slice(0, -1);
    expect(received).toEqual(nasty);
  });
});
