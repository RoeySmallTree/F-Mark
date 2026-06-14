#!/usr/bin/env node
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const WORKSPACE = resolve(fileURLToPath(new URL("../../../../", import.meta.url)));
const HOT_DIR = join(WORKSPACE, "packages/kernel/tests/hot");
const RUN = `phase23-${Date.now().toString(36)}`;

if (process.env.FMARK_HOT !== "1") {
  console.error("Set FMARK_HOT=1 to run Phase 23 full vendor E2E hot checks.");
  process.exit(1);
}

const report = {
  run: RUN,
  artifactRoot: null,
  checks: [],
  subreports: {},
  matrix: {
    claude: {},
    codex: {},
    gemini: {},
  },
};

function pass(name, detail = {}) {
  report.checks.push({ name, status: "PASS", ...detail });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function tail(value, max = 4000) {
  return value.length <= max ? value : value.slice(-max);
}

function runNode(scriptName, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = execFile(
      process.execPath,
      [join(HOT_DIR, scriptName)],
      {
        cwd: WORKSPACE,
        env: {
          ...process.env,
          FMARK_HOT: "1",
          NO_COLOR: "1",
          ...(options.env ?? {}),
        },
        timeout: options.timeoutMs ?? 900_000,
        maxBuffer: 1024 * 1024 * 64,
      },
      (error, stdout, stderr) => {
        const output = `${stdout.toString()}\n${stderr.toString()}`;
        const result = {
          scriptName,
          code: error?.code ?? 0,
          stdout: stdout.toString(),
          stderr: stderr.toString(),
          output,
        };
        if (error) {
          const wrapped = new Error(
            `${scriptName} failed with code ${result.code}: ${tail(output)}`,
          );
          wrapped.result = result;
          reject(wrapped);
          return;
        }
        resolvePromise(result);
      },
    );
    child.stdin?.end();
  });
}

function extractReportPath(output) {
  const matches = [...output.matchAll(/HOT_TEST_REPORT\s+(\S+)/g)];
  if (matches.length === 0) return null;
  return matches[matches.length - 1][1];
}

async function runLeg(key, scriptName, options = {}) {
  const result = await runNode(scriptName, options);
  const reportPath = extractReportPath(result.output);
  assert(reportPath !== null, `${scriptName} did not print HOT_TEST_REPORT`);
  const parsed = JSON.parse(await readFile(reportPath, "utf8"));
  const failed = (parsed.checks ?? []).filter((check) => check.status !== "PASS");
  assert(failed.length === 0, `${scriptName} had failed checks: ${JSON.stringify(failed)}`);
  report.subreports[key] = {
    scriptName,
    reportPath,
    run: parsed.run,
    artifactRoot: parsed.artifactRoot ?? null,
    checkCount: (parsed.checks ?? []).length,
  };
  pass(`${key} leg passed`, {
    scriptName,
    reportPath,
    checkCount: (parsed.checks ?? []).length,
  });
  return parsed;
}

function markAllVendors(field, source) {
  for (const vendor of ["claude", "codex", "gemini"]) {
    report.matrix[vendor][field] = source;
  }
}

async function main() {
  let artifactRoot = null;
  try {
    artifactRoot = await mkdtemp(join(tmpdir(), "fmark-mcp-phase23-hot-"));
    report.artifactRoot = artifactRoot;
    await mkdir(artifactRoot, { recursive: true });

    await runLeg("phase8_install_apply", "phase8-integration-apply-hot.mjs", {
      timeoutMs: 240_000,
    });
    markAllVendors("install_scopes", "phase8_install_apply");

    await runLeg("phase9_managed_spawn", "phase9-spawn-sequencing-hot.mjs", {
      timeoutMs: 240_000,
    });
    markAllVendors("managed_launch_and_desired_name", "phase9_managed_spawn");

    await runLeg("phase5_real_mcp_hello", "phase5-mcp-real-agents-hot.mjs", {
      timeoutMs: 420_000,
    });
    markAllVendors("hello_through_mcp", "phase5_real_mcp_hello");

    await runLeg("phase13_controls", "phase13-agent-controls-hot.mjs", {
      timeoutMs: 360_000,
    });
    markAllVendors("compact_clear_controls", "phase13_controls");

    await runLeg("phase16_access", "phase16-access-requests-hot.mjs", {
      timeoutMs: 600_000,
    });
    report.matrix.claude.permission_request_card = "phase16_access";
    report.matrix.codex.permission_request_card = "phase16_access";
    report.matrix.gemini.access_or_trust_notification_card = "phase16_access";
    markAllVendors("tool_or_access_hook_capture", "phase16_access");

    await runLeg("phase18_fork", "phase18-session-fork-vendors-hot.mjs", {
      timeoutMs: 600_000,
    });
    report.matrix.claude.session_fork = "phase18_fork";
    report.matrix.codex.session_fork = "phase18_fork";
    report.matrix.gemini.fmark_owned_session_fork = "phase18_fork";

    const subagents = await runLeg("phase19_subagents", "phase19-subagent-vendors-hot.mjs", {
      env: { FMARK_KEEP_HOT_ARTIFACTS: "1" },
      timeoutMs: 900_000,
    });
    markAllVendors("subagent_capture", "phase19_subagents");

    const realProject = join(subagents.artifactRoot, "project");
    assert(existsSync(realProject), `phase19 real project missing at ${realProject}`);
    await runLeg("phase20_subagent_ui", "phase20-subagent-ui-hot.mjs", {
      env: { FMARK_PHASE20_REAL_PROJECT: realProject },
      timeoutMs: 360_000,
    });
    markAllVendors("subagent_final_result_box_ui", "phase20_subagent_ui");

    const reportPath = join(artifactRoot, "report.json");
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`HOT_TEST_REPORT ${reportPath}`);
  } catch (err) {
    if (artifactRoot !== null) {
      report.error = err instanceof Error ? `${err.message}\n${err.stack ?? ""}` : String(err);
      if (err?.result !== undefined) {
        report.failedCommand = {
          scriptName: err.result.scriptName,
          code: err.result.code,
          stdoutTail: tail(err.result.stdout),
          stderrTail: tail(err.result.stderr),
        };
      }
      const reportPath = join(artifactRoot, "report.failed.json");
      await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`).catch(() => {});
      console.error(`HOT_TEST_FAILED ${reportPath}`);
    }
    throw err;
  }
}

await main();
