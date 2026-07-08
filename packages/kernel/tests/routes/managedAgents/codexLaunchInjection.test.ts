import { describe, expect, it } from "vitest";
import {
  codexFmarkHookLaunchArgs,
  codexFmarkLaunchArgs,
  codexFmarkMcpLaunchArgs,
  codexForkArgs,
  serializeTomlInlineValue,
} from "../../../src/routes/managedAgents/codexLaunchInjection.js";
import { spawnArgsForRuntime } from "../../../src/routes/managedAgents/runtimeArgs.js";

describe("serializeTomlInlineValue", () => {
  it("serializes strings as escaped TOML basic strings", () => {
    expect(serializeTomlInlineValue("hi")).toBe('"hi"');
    expect(serializeTomlInlineValue('a"b\\c')).toBe('"a\\"b\\\\c"');
  });

  it("serializes numbers and booleans", () => {
    expect(serializeTomlInlineValue(30)).toBe("30");
    expect(serializeTomlInlineValue(true)).toBe("true");
  });

  it("serializes string arrays with no spaces", () => {
    expect(serializeTomlInlineValue(["x", "y"])).toBe('["x","y"]');
  });

  it("serializes inline tables with bare keys", () => {
    expect(serializeTomlInlineValue({ type: "command", timeout: 30 })).toBe(
      '{type="command",timeout=30}',
    );
  });

  it("omits undefined inline-table fields", () => {
    expect(
      serializeTomlInlineValue({ command: "c", statusMessage: undefined }),
    ).toBe('{command="c"}');
  });
});

describe("codexFmarkMcpLaunchArgs", () => {
  const projectRoot = "/tmp/example-project";
  const env: NodeJS.ProcessEnv = { HOME: "/home/tester" };

  it("defines the full fmark MCP server via -c overrides including --path", () => {
    const args = codexFmarkMcpLaunchArgs({ projectRoot, env });
    const joined = args.join(" ");
    expect(joined).toContain("mcp_servers.fmark.command=");
    expect(joined).toContain("mcp_servers.fmark.args=");
    // args array must carry the project root via --path
    const argsFlag = args[args.indexOf("mcp_servers.fmark.args=" ) ] ?? joined;
    expect(joined).toContain("--path");
    expect(joined).toContain(projectRoot);
    expect(joined).toContain(
      'mcp_servers.fmark.env.F_MARK_MCP_VERSION="phase5-stdio-v1"',
    );
    expect(joined).toContain('mcp_servers.fmark.default_tools_approval_mode="prompt"');
    // every -c is preceded by a -c flag
    for (let i = 0; i < args.length; i += 2) {
      expect(args[i]).toBe("-c");
    }
  });

  it("includes per-tool approval overrides set to approve", () => {
    const joined = codexFmarkMcpLaunchArgs({ projectRoot, env }).join(" ");
    expect(joined).toContain('mcp_servers.fmark.tools.fmark_post_prose.approval_mode="approve"');
    expect(joined).toContain('mcp_servers.fmark.tools.fmark_end_turn.approval_mode="approve"');
  });
});

describe("codexFmarkHookLaunchArgs", () => {
  it("injects all four autostream events plus the trust-bypass flag", () => {
    const args = codexFmarkHookLaunchArgs();
    expect(args).toContain("--dangerously-bypass-hook-trust");
    const joined = args.join(" ");
    for (const event of ["Stop", "UserPromptSubmit", "PermissionRequest", "PostToolUse"]) {
      expect(joined).toContain(`hooks.${event}=`);
    }
  });

  it("serializes generic env-resolved autostream commands (no baked participant id)", () => {
    const joined = codexFmarkHookLaunchArgs().join(" ");
    expect(joined).toContain("auto-stream");
    expect(joined).toContain("--fmark-hook-version");
    expect(joined).toContain("managed-only-v3");
    // UserPromptSubmit is the user-kind hook
    expect(joined).toContain("--kind");
  });
});

describe("codexFmarkLaunchArgs", () => {
  it("combines mcp + hook injection into a single deterministic arg vector", () => {
    const projectRoot = "/tmp/example-project";
    const env: NodeJS.ProcessEnv = { HOME: "/home/tester" };
    const combined = codexFmarkLaunchArgs({ projectRoot, env });
    const mcp = codexFmarkMcpLaunchArgs({ projectRoot, env });
    const hooks = codexFmarkHookLaunchArgs();
    expect(combined).toEqual([...mcp, ...hooks]);
  });
});

describe("spawnArgsForRuntime codex injection", () => {
  it("injects the fmark MCP server, hooks, and trust bypass for codex, prompt last", () => {
    const res = spawnArgsForRuntime({
      runtimeId: "codex",
      args: ["--foo"],
      desiredName: null,
      launchPrompt: "PROMPT",
      accessMode: "default",
      projectRoot: "/tmp/proj",
      env: { HOME: "/home/t" },
    });
    const joined = res.args.join(" ");
    expect(joined).toContain("mcp_servers.fmark.command=");
    expect(joined).toContain("hooks.Stop=");
    expect(res.args).toContain("--dangerously-bypass-hook-trust");
    expect(res.args[0]).toBe("--foo");
    expect(res.args[res.args.length - 1]).toBe("PROMPT");
  });

  it("does not inject fmark args for non-codex runtimes", () => {
    const res = spawnArgsForRuntime({
      runtimeId: "claude",
      args: [],
      desiredName: null,
      launchPrompt: "P",
      accessMode: "default",
      projectRoot: "/tmp/proj",
      env: {},
    });
    expect(res.args.join(" ")).not.toContain("mcp_servers.fmark");
    expect(res.args).not.toContain("--dangerously-bypass-hook-trust");
  });
});

describe("codexForkArgs", () => {
  it("injects fmark launch args between base args and the fork subcommand", () => {
    const args = codexForkArgs(["--sandbox", "danger"], "sess-123", {
      projectRoot: "/tmp/proj",
      env: { HOME: "/home/t" },
    });
    // base runtime args stay first
    expect(args.slice(0, 2)).toEqual(["--sandbox", "danger"]);
    // `fork <handle>` subcommand stays last
    expect(args.slice(-2)).toEqual(["fork", "sess-123"]);
    const joined = args.join(" ");
    expect(joined).toContain("mcp_servers.fmark.command=");
    expect(joined).toContain("hooks.Stop=");
    // global -c / trust-bypass flags MUST precede the `fork` subcommand
    expect(args.indexOf("--dangerously-bypass-hook-trust")).toBeGreaterThan(-1);
    expect(args.indexOf("--dangerously-bypass-hook-trust")).toBeLessThan(
      args.indexOf("fork"),
    );
  });
});
