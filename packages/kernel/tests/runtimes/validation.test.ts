import { describe, expect, it } from "vitest";
import {
  validateExecutable,
  validateArgs,
  validateSlashCommand,
  validateMessageText,
  validateRuntimeEntry,
} from "../../src/runtimes/validation.js";

describe("validation", () => {
  it("accepts safe executables", () => {
    expect(() => validateExecutable("claude")).not.toThrow();
    expect(() => validateExecutable("/usr/local/bin/claude")).not.toThrow();
    expect(() => validateExecutable("./scripts/run-claude")).not.toThrow();
  });

  it("rejects shell metacharacters in executables", () => {
    for (const bad of ["claude && rm -rf /", "claude;ls", "claude|cat", "claude `id`", "claude\nls", "claude $(ls)", "claude with space"]) {
      expect(() => validateExecutable(bad)).toThrow(/invalid executable/);
    }
  });

  it("rejects shells and interpreters by basename (F.8 RCE)", () => {
    for (const bad of [
      "/bin/sh", "sh", "bash", "/bin/bash", "/usr/bin/zsh", "dash", "ksh",
      "node", "/usr/local/bin/node", "nodejs", "deno", "bun",
      "python", "python3", "/usr/bin/python3", "python3.11", "python3.12",
      "ruby", "ruby3.1", "perl", "php", "php8.2", "lua",
      "awk", "/usr/bin/env",
    ]) {
      expect(() => validateExecutable(bad), `expected ${bad} to be rejected`).toThrow(/shell or interpreter/);
    }
  });

  it("rejects path traversal in executables", () => {
    expect(() => validateExecutable("../etc/passwd")).toThrow(/path traversal/);
    expect(() => validateExecutable("./bin/../../etc/passwd")).toThrow(/path traversal/);
  });

  it("catches shells hidden behind path-normalization tricks", () => {
    // /usr/local/../bin/sh normalizes to /usr/bin/sh — basename still 'sh'.
    expect(() => validateExecutable("/usr/local/../bin/sh")).toThrow(/shell or interpreter/);
  });

  it("rejects oversized executable strings", () => {
    expect(() => validateExecutable("a".repeat(513))).toThrow(/too long/);
  });

  it("accepts args as a string array", () => {
    expect(() => validateArgs(["--model", "haiku"])).not.toThrow();
  });

  it("rejects non-string args", () => {
    expect(() => validateArgs(["--model", 123 as unknown as string])).toThrow();
  });

  it("validateSlashCommand accepts alphanumeric ≤32", () => {
    expect(() => validateSlashCommand("compact")).not.toThrow();
    expect(() => validateSlashCommand("custom-name_1")).not.toThrow();
    expect(() => validateSlashCommand("1bad")).toThrow();
    expect(() => validateSlashCommand("has space")).toThrow();
    expect(() => validateSlashCommand("a".repeat(33))).toThrow();
  });

  it("validateMessageText rejects control chars except \\t", () => {
    expect(() => validateMessageText("hello\tworld")).not.toThrow();
    expect(() => validateMessageText("hello\nworld")).toThrow(/control char/);
    expect(() => validateMessageText("\x00")).toThrow();
    expect(() => validateMessageText("\x7f")).toThrow(/control char/);
  });

  it("validateRuntimeEntry catches missing fields", () => {
    expect(() => validateRuntimeEntry({ displayName: "X", executable: "x", args: [] })).not.toThrow();
    expect(() => validateRuntimeEntry({ executable: "x", args: [] } as unknown as Record<string, unknown>)).toThrow();
    expect(() => validateRuntimeEntry({ displayName: "X", executable: "bad name", args: [] })).toThrow();
  });
});
