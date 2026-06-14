import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  applyCodexHooks,
  detectCodexHooks,
  renderCodexInstallSnippet,
} from "../../src/hooksInstall/codex.js";
import { autoStreamHookCommand } from "../../src/hooksInstall/command.js";

function tomlCommand(command: string): string {
  return `[${command.split(" ").map((part) => JSON.stringify(part)).join(", ")}]`;
}

function multilineTomlCommand(command: string): string {
  return [
    "[",
    ...command.split(" ").map((part, index, parts) => {
      const suffix = index === parts.length - 1 ? "" : ",";
      return `  ${JSON.stringify(part)}${suffix}`;
    }),
    "]",
  ].join("\n");
}

describe("Codex hooks adapter", () => {
  it("detects installed when hooks are enabled and all required hooks exist", () => {
    const agentCommand = autoStreamHookCommand({ participantId: "ag-codex-1" });
    const userCommand = autoStreamHookCommand({
      participantId: "us-1",
      kind: "user",
    });
    const toml = `
[features]
hooks = true

[[hooks.Stop]]
command = ${tomlCommand(agentCommand)}
timeout = 30

[[hooks.UserPromptSubmit]]
command = ${tomlCommand(userCommand)}
timeout = 10

[[hooks.PermissionRequest]]
command = ${tomlCommand(agentCommand)}
timeout = 300
    `;
    const r = detectCodexHooks(toml, "ag-codex-1", "us-1");
    expect(r.installed).toBe(true);
    expect(r.status).toBe("installed");
    expect(r.detectedEntries.length).toBe(3);
  });

  it("partial install reported as stale", () => {
    const agentCommand = autoStreamHookCommand({ participantId: "ag-codex-1" });
    const toml = `[[hooks.Stop]]
command = ${tomlCommand(agentCommand)}`;
    const r = detectCodexHooks(toml, "ag-codex-1", "us-1");
    expect(r.installed).toBe(false);
    expect(r.status).toBe("stale");
  });

  it("reports the legacy Bash-only PermissionRequest hook as stale", () => {
    const agentCommand = autoStreamHookCommand({ participantId: "ag-codex-1" });
    const userCommand = autoStreamHookCommand({
      participantId: "us-1",
      kind: "user",
    });
    const hooksJson = JSON.stringify({
      hooks: {
        Stop: [{ hooks: [{ type: "command", command: agentCommand }] }],
        UserPromptSubmit: [
          { hooks: [{ type: "command", command: userCommand }] },
        ],
        PermissionRequest: [
          {
            matcher: "Bash",
            hooks: [{ type: "command", command: agentCommand }],
          },
        ],
      },
    });
    const r = detectCodexHooks(
      { toml: "[features]\nhooks = true\n", hooksJson },
      "ag-codex-1",
      "us-1",
    );
    expect(r.installed).toBe(false);
    expect(r.status).toBe("stale");
  });

  it("renders a valid snippet", () => {
    const s = renderCodexInstallSnippet("ag-codex-1", "us-1");
    expect(s).toContain("ag-codex-1");
    expect(s).toContain("us-1");
    expect(s).toContain('"Stop"');
    expect(s).toContain('"UserPromptSubmit"');
    expect(s).toContain("PermissionRequest");
    expect(s).toContain("hook auto-stream");
    expect(s).not.toContain("npx -y f-mark");
  });

  it("returns empty detected entries on empty TOML", () => {
    const r = detectCodexHooks("", "ag-codex-1", "us-1");
    expect(r.installed).toBe(false);
    expect(r.status).toBe("missing");
    expect(r.detectedEntries).toEqual([]);
  });

  it("detects hooks declared with a multiline command array", () => {
    const agentCommand = autoStreamHookCommand({ participantId: "ag-codex-1" });
    const userCommand = autoStreamHookCommand({
      participantId: "us-1",
      kind: "user",
    });
    const toml = `
[features]
hooks = true

[[hooks.Stop]]
command = ${multilineTomlCommand(agentCommand)}
timeout = 30

[[hooks.UserPromptSubmit]]
command = ${multilineTomlCommand(userCommand)}

[[hooks.PermissionRequest]]
command = ${multilineTomlCommand(agentCommand)}
`;
    const r = detectCodexHooks(toml, "ag-codex-1", "us-1");
    expect(r.installed).toBe(true);
    expect(r.detectedEntries.length).toBe(3);
  });

  it("does not detect commented-out command lines as installed", () => {
    const toml = `
[features]
hooks = true

[[hooks.Stop]]
# command = ["npx", "-y", "f-mark", "hook", "auto-stream", "ag-codex-1"]

[[hooks.UserPromptSubmit]]
# command = ["npx", "-y", "f-mark", "hook", "auto-stream", "us-1", "--kind", "user"]
`;
    const r = detectCodexHooks(toml, "ag-codex-1", "us-1");
    expect(r.installed).toBe(false);
    expect(r.detectedEntries).toEqual([]);
  });

  it("detects when one event uses single-line and the other uses multiline arrays", () => {
    const agentCommand = autoStreamHookCommand({ participantId: "ag-codex-1" });
    const userCommand = autoStreamHookCommand({
      participantId: "us-1",
      kind: "user",
    });
    const toml = `
[features]
hooks = true

[[hooks.Stop]]
command = ${tomlCommand(agentCommand)}
timeout = 30

[[hooks.UserPromptSubmit]]
command = ${multilineTomlCommand(userCommand)}

[[hooks.PermissionRequest]]
command = ${tomlCommand(agentCommand)}
timeout = 300
`;
    const r = detectCodexHooks(toml, "ag-codex-1", "us-1");
    expect(r.installed).toBe(true);
    expect(r.detectedEntries.length).toBe(3);
  });

  it("detects when hooks live across both user-level and project-local TOML", () => {
    const agentCommand = autoStreamHookCommand({ participantId: "ag-codex-1" });
    const userCommand = autoStreamHookCommand({
      participantId: "us-1",
      kind: "user",
    });
    // Simulates the dispatcher concatenating ~/.codex/config.toml and
    // <projectRoot>/.codex/config.toml. detectCodexHooks should treat the
    // combined content as a single TOML stream so installed status reflects
    // the union of both files.
    const userToml = `
[features]
hooks = true

[[hooks.Stop]]
command = ${tomlCommand(agentCommand)}
`;
    const projectToml = `
[[hooks.UserPromptSubmit]]
command = ${tomlCommand(userCommand)}

[[hooks.PermissionRequest]]
command = ${tomlCommand(agentCommand)}
`;
    const combined = userToml + "\n" + projectToml;
    const r = detectCodexHooks(combined, "ag-codex-1", "us-1");
    expect(r.installed).toBe(true);
    expect(r.detectedEntries.length).toBe(3);
  });

  it("applyCodexHooks enables hooks and writes all required hook commands", async () => {
    const previous = process.env.CODEX_HOME;
    const home = await mkdtemp(join(tmpdir(), "fmark-codex-hooks-"));
    process.env.CODEX_HOME = home;
    try {
      const applied = await applyCodexHooks("ag-codex-1", "us-1");
      expect(applied.changed).toBe(true);
      const toml = await readFile(join(home, "config.toml"), "utf8");
      const hooksJson = await readFile(join(home, "hooks.json"), "utf8");
      const hooksConfig = JSON.parse(hooksJson);
      const detected = detectCodexHooks(
        { toml, hooksJson },
        "ag-codex-1",
        "us-1",
      );
      expect(detected.installed).toBe(true);
      expect(detected.detectedEntries.map((entry) => entry.event).sort()).toEqual([
        "PermissionRequest",
        "Stop",
        "UserPromptSubmit",
      ]);
      expect(hooksConfig.hooks.PermissionRequest[0].matcher).toBeUndefined();
      expect(hooksJson).not.toContain("npx -y f-mark");
      expect(toml).toContain("[hooks.state.");
      expect(toml).toContain("trusted_hash = \"sha256:");
    } finally {
      if (previous === undefined) {
        delete process.env.CODEX_HOME;
      } else {
        process.env.CODEX_HOME = previous;
      }
      await rm(home, { recursive: true, force: true });
    }
  });

  it("detects hooks.json installs without matching trust state as stale", () => {
    const agentCommand = autoStreamHookCommand({ participantId: "ag-codex-1" });
    const userCommand = autoStreamHookCommand({
      participantId: "us-1",
      kind: "user",
    });
    const hooksJson = JSON.stringify({
      hooks: {
        Stop: [{ hooks: [{ type: "command", command: agentCommand, timeout: 30 }] }],
        UserPromptSubmit: [
          { hooks: [{ type: "command", command: userCommand, timeout: 10 }] },
        ],
        PermissionRequest: [
          {
            hooks: [
              {
                type: "command",
                command: agentCommand,
                timeout: 300,
                statusMessage: "Waiting for F-Mark access response",
              },
            ],
          },
        ],
      },
    });

    const detected = detectCodexHooks(
      {
        toml: "[features]\nhooks = true\n",
        hooksJson,
        configPath: "/tmp/codex/hooks.json",
      },
      "ag-codex-1",
      "us-1",
    );

    expect(detected.installed).toBe(false);
    expect(detected.status).toBe("stale");
  });

  it("applyCodexHooks replaces legacy Bash-only PermissionRequest hook shape", async () => {
    const previous = process.env.CODEX_HOME;
    const home = await mkdtemp(join(tmpdir(), "fmark-codex-hooks-legacy-"));
    process.env.CODEX_HOME = home;
    try {
      const agentCommand = autoStreamHookCommand({ participantId: "ag-codex-1" });
      await writeFile(
        join(home, "hooks.json"),
        JSON.stringify({
          hooks: {
            PermissionRequest: [
              {
                matcher: "Bash",
                hooks: [{ type: "command", command: agentCommand, timeout: 300 }],
              },
            ],
          },
        }),
      );

      await applyCodexHooks("ag-codex-1", "us-1");

      const hooksConfig = JSON.parse(await readFile(join(home, "hooks.json"), "utf8"));
      expect(hooksConfig.hooks.PermissionRequest).toHaveLength(1);
      expect(hooksConfig.hooks.PermissionRequest[0].matcher).toBeUndefined();
    } finally {
      if (previous === undefined) {
        delete process.env.CODEX_HOME;
      } else {
        process.env.CODEX_HOME = previous;
      }
      await rm(home, { recursive: true, force: true });
    }
  });
});
