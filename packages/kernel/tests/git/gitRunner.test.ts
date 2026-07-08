/* Git runner safety: timeout kill + stdout byte cap (review blocker 4). Uses
   sh/dd rather than git so the behavior is deterministic and fast. */

import { describe, it, expect } from "vitest";
import { gitRun } from "../../src/git/gitRunner.js";

describe("gitRun timeout + caps", () => {
  it("kills a child that exceeds the timeout (exitCode 124, timedOut)", async () => {
    const res = await gitRun(["sh", "-c", "sleep 5"], {
      timeoutMs: 150,
      maxStdoutBytes: 1024,
      maxStderrBytes: 1024,
    });
    expect(res.timedOut).toBe(true);
    expect(res.exitCode).toBe(124);
  });

  it("caps stdout at maxStdoutBytes and flags truncation", async () => {
    /* Emit ~1MB but cap at 1000 bytes. */
    const res = await gitRun(
      ["sh", "-c", "head -c 1000000 /dev/zero | tr '\\0' 'a'"],
      { timeoutMs: 5000, maxStdoutBytes: 1000, maxStderrBytes: 1024 },
    );
    expect(res.stdout.length).toBeLessThanOrEqual(1000);
    expect(res.stdoutTruncated).toBe(true);
  });

  it("returns 127 for a missing executable", async () => {
    const res = await gitRun(["definitely-not-a-real-binary-xyz"], {
      timeoutMs: 1000,
      maxStdoutBytes: 1024,
      maxStderrBytes: 1024,
    });
    expect(res.exitCode).toBe(127);
  });

  it("passes through normal small output", async () => {
    const res = await gitRun(["sh", "-c", "printf hello"], {
      timeoutMs: 1000,
      maxStdoutBytes: 1024,
      maxStderrBytes: 1024,
    });
    expect(res.stdout).toBe("hello");
    expect(res.exitCode).toBe(0);
    expect(res.timedOut).toBe(false);
    expect(res.stdoutTruncated).toBe(false);
  });
});
