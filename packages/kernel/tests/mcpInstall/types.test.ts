import { afterEach, describe, expect, it } from "vitest";
import { join, sep } from "node:path";
import {
  FMARK_MCP_INSTALL_VERSION,
  fmarkMcpCommandSpec,
} from "../../src/mcpInstall/types.js";

const ORIGINAL_ARGV = [...process.argv];

function setEntrypoint(entrypoint: string | undefined): void {
  process.argv.splice(0, process.argv.length, process.execPath);
  if (entrypoint !== undefined) process.argv.push(entrypoint);
}

describe("fmarkMcpCommandSpec", () => {
  afterEach(() => {
    process.argv.splice(0, process.argv.length, ...ORIGINAL_ARGV);
  });

  it("uses a TS loader for dev-mode TypeScript entrypoints", () => {
    const entrypoint = join(process.cwd(), "src", "index.ts");
    setEntrypoint(entrypoint);

    const spec = fmarkMcpCommandSpec("/tmp/fmark-project", {});

    expect(
      spec.command === "tsx" ||
        spec.command.endsWith(
          `${sep}node_modules${sep}.bin${sep}${process.platform === "win32" ? "tsx.cmd" : "tsx"}`,
        ),
    ).toBe(true);
    expect(spec.command).not.toBe(process.execPath);
    expect(spec.args).toEqual([entrypoint, "mcp", "--path", "/tmp/fmark-project"]);
    expect(spec.env.F_MARK_MCP_VERSION).toBe(FMARK_MCP_INSTALL_VERSION);
  });

  it("keeps node for built JavaScript entrypoints", () => {
    const entrypoint = join(process.cwd(), "dist", "index.js");
    setEntrypoint(entrypoint);

    const spec = fmarkMcpCommandSpec("/tmp/fmark-project", {});

    expect(spec.command).toBe(process.execPath);
    expect(spec.args).toEqual([entrypoint, "mcp", "--path", "/tmp/fmark-project"]);
  });

  it("lets explicit MCP command overrides continue to win", () => {
    setEntrypoint(join(process.cwd(), "src", "index.ts"));

    const spec = fmarkMcpCommandSpec("/tmp/fmark-project", {
      F_MARK_MCP_COMMAND: "custom-fmark",
      F_MARK_MCP_ARGS: '["mcp"]',
    });

    expect(spec.command).toBe("custom-fmark");
    expect(spec.args).toEqual(["mcp", "--path", "/tmp/fmark-project"]);
  });
});
