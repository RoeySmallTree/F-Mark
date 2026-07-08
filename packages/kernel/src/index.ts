import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import process from "node:process";
import {
  deleteTokenFile,
  ensureProjectAuth,
  readExistingToken,
  resolveBootToken,
} from "./auth.js";
import { renderBanner, type BannerMode } from "./banner.js";
import { parseArgs, printUsage, runCli, type CliOptions } from "./cli.js";
import { DEFAULT_PORT, HOST, VERSION } from "./config.js";
import { ensurePortAvailableForLaunch } from "./launch/portCleanup.js";
import { listenOnPinnedPort } from "./launch/listen.js";
import * as logger from "./logger.js";
import { mkdir } from "node:fs/promises";
import { paths } from "./paths.js";
import { activePaths } from "./paths/active.js";
import { PathContextRef } from "./paths/contextRef.js";
import { globalPaths } from "./paths/global.js";
import { listRegisteredProjectPaths, registerProjectPath } from "./paths/registry.js";
import { bumpRevision, mruPush, readState, updateState } from "./state/store.js";
import { resolveBootActivePath } from "./boot/activePath.js";
import { runV04Migration } from "./boot/migration.js";
import { initProject, readConfig, writeConfig } from "./project.js";
import { reconcile } from "./reconcile.js";
import { createServer } from "./server.js";
import {
  acquireKernelStartupLock,
  allowMultipleKernels,
  parseDevSupervisorPid,
  removeKernelInstanceRecordIfCurrent,
  terminatePreviousKernelInstance,
  writeKernelInstanceRecord,
  type KernelInstanceIdentity,
  type KernelStartupLock,
} from "./services/kernelInstance.js";
import { realCommandRunner } from "./tmux/commandRunner.js";
import { createTmuxManager } from "./tmux/manager.js";
import type { FastifyInstance } from "fastify";

function parseOrExit(): CliOptions {
  try {
    return parseArgs(process.argv.slice(2));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Error: ${message}\n`);
    printUsage();
    process.exit(1);
  }
}

const rawArgv = process.argv.slice(2);

// Subcommand dispatch (e.g. `f-mark hook auto-stream <participant>`).
// Subcommands are short-lived: they run runCli, then exit. They never
// fall through into the kernel-startup flow below.
if (rawArgv[0] === "hook" || rawArgv[0] === "mcp") {
  const code = await runCli(rawArgv);
  process.exit(code);
}

const options = parseOrExit();

if (options.help) {
  printUsage();
  process.exit(0);
}

// --path overrides INIT_CWD/cwd. Used by scripts that want to point the
// kernel at a specific project without relying on shell cwd; persisted to
// the global state.json below so subsequent boots without --path remember.
const launchRoot = options.path ?? process.env.INIT_CWD ?? process.cwd();
const requestedPort = options.port ?? DEFAULT_PORT;

// Global multi-path state owns the active project. A normal launch reuses the
// stored active path; --path or first-run migration can replace/seed it.
const gPaths = globalPaths();
await mkdir(gPaths.configDir(), { recursive: true });

// One-shot v0.4 → v0.5 migration. No-op when state.json already exists.
// On first run, moves <cwd>/.f-mark/agents/, runtimes.json, and splits
// config.json into the global tree under ~/.config/f-mark/projects/<pathId>/.
try {
  await runV04Migration(launchRoot, gPaths);
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`v0.4 migration failed: ${msg}\n`);
}

const projectRoot = resolveBootActivePath({
  explicitPath: options.path,
  launchPath: launchRoot,
  state: await readState(gPaths),
});
const p = paths(projectRoot);
await initProject(p, requestedPort);

const activePath = activePaths(projectRoot);
const pathContextRef = new PathContextRef({
  global: gPaths,
  active: activePath,
});

// Persist the active path resolved above so the renderer (and any PathSwitcher
// dropdown) sees it immediately. A normal launch keeps the previous active
// path; an explicit --path intentionally replaces it. Also push to knownPaths
// so it shows up under recents on the next launch.
const bootState = await updateState(gPaths, (s) =>
  bumpRevision(mruPush({ ...s, activePath: projectRoot }, projectRoot)),
);
await registerProjectPath(gPaths, projectRoot);
pathContextRef.setRevision(bootState.activeRevision);

// The token is STABLE across restarts: resolveBootToken reuses an existing
// .f-mark/.token rather than minting a new one each boot. This is what keeps
// long-lived/reconciled agents authenticated after a kernel restart — they
// read the same token file the kernel validates against, so a restart no
// longer strands them with 401s. tokenGenerated tracks whether THIS boot
// created the file, which gates the bind-failure cleanup below.
const { token, generated: tokenGenerated } = await resolveBootToken(p, {
  noAuth: options.noAuth,
  password: options.password,
});
if (options.noAuth) {
  logger.warn(
    "Auth is disabled (--no-auth). Anyone with network access can use the API.",
  );
} else {
  // Re-assert file mode (0600) + .gitignore entry even when the token is reused.
  await ensureProjectAuth(p, token);
}

const devRestartExitCodeRaw = process.env.FMARK_DEV_RESTART_EXIT_CODE;
const devRestartExitCode =
  devRestartExitCodeRaw !== undefined ? Number(devRestartExitCodeRaw) : null;
const devRestartEnabled =
  devRestartExitCode !== null &&
  Number.isInteger(devRestartExitCode) &&
  devRestartExitCode > 0;
const devRestartCode = devRestartEnabled ? devRestartExitCode : null;
const singletonDisabled = allowMultipleKernels(process.env);
const devSupervisorPid = parseDevSupervisorPid(
  process.env.FMARK_DEV_SUPERVISOR_PID,
);
const kernelIdentity: KernelInstanceIdentity = {
  instance_id: randomUUID(),
  pid: process.pid,
  config_root: gPaths.configDir(),
  project_root: projectRoot,
  path_id: activePath.pathId(),
  host: HOST,
  port: requestedPort,
  version: VERSION,
  started_at: new Date().toISOString(),
  ...(devSupervisorPid !== undefined
    ? { dev_supervisor_pid: devSupervisorPid }
    : {}),
};

let appForShutdown: FastifyInstance | null = null;
let startupLock: KernelStartupLock | null = null;
let shuttingDown = false;
async function releaseStartupLock(): Promise<void> {
  if (startupLock === null) return;
  const lock = startupLock;
  startupLock = null;
  try {
    await lock.release();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(`Could not release kernel startup lock: ${msg}`);
  }
}

async function cleanupKernelInstanceRecord(): Promise<void> {
  if (singletonDisabled) return;
  try {
    await removeKernelInstanceRecordIfCurrent(
      gPaths.kernelInstanceFile(),
      kernelIdentity,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(`Could not remove kernel instance record: ${msg}`);
  }
}

async function shutdown(signal: string, exitCode = 0): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`Received ${signal}. Shutting down...`);
  if (appForShutdown !== null) await appForShutdown.close();
  await cleanupKernelInstanceRecord();
  // Intentionally DO NOT delete the token file. It is a stable project
  // credential reused across restarts (see resolveBootToken); deleting it
  // here would strand long-lived agents that outlive the kernel and the
  // agents re-adopted by the next boot's reconcile step (→ 401s).
  process.exit(exitCode);
}

const { app, getBus, getTracker } = createServer({
  token,
  paths: p,
  allowProcessApiNoAuth: options.allowProcessApiNoAuth,
  pathContextRef,
  quietCrossPathHooks: options.quietCrossPathHooks,
  kernelIdentity,
  ...(devRestartCode !== null
    ? {
        requestKernelRestart: () => {
          void shutdown("dev restart", devRestartCode);
        },
      }
    : {}),
});
appForShutdown = app;

async function cleanupGeneratedBootToken(): Promise<void> {
  // Only clean up a token THIS boot generated, and only if the file still
  // holds OUR token — never clobber a persisted token that predates this boot
  // or one a concurrently-booting kernel may now own.
  if (token !== null && tokenGenerated) {
    const onDisk = await readExistingToken(p);
    if (onDisk === token) await deleteTokenFile(p);
  }
}

try {
  if (!singletonDisabled) {
    startupLock = await acquireKernelStartupLock(gPaths.kernelStartupLockDir(), {
      logger,
    });
    await terminatePreviousKernelInstance({
      instanceFile: gPaths.kernelInstanceFile(),
      configRoot: gPaths.configDir(),
      currentInstanceId: kernelIdentity.instance_id,
      logger,
    });
  } else {
    logger.warn(
      "FMARK_ALLOW_MULTIPLE_KERNELS=1 is set; skipping kernel singleton replacement.",
    );
  }
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  logger.error(msg);
  await releaseStartupLock();
  await cleanupGeneratedBootToken();
  process.exit(1);
}

try {
  await ensurePortAvailableForLaunch({
    port: requestedPort,
    host: HOST,
    logger,
  });
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  logger.error(msg);
  await releaseStartupLock();
  await cleanupGeneratedBootToken();
  process.exit(1);
}

try {
  await listenOnPinnedPort(app, { port: requestedPort, host: HOST });
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  logger.error(msg);
  await releaseStartupLock();
  await cleanupGeneratedBootToken();
  process.exit(1);
}

const port = requestedPort;

async function syncProjectConnection(p: ReturnType<typeof paths>): Promise<void> {
  await initProject(p, port);
  await ensureProjectAuth(p, token);
  const cfg = await readConfig(p);
  if (cfg.port !== port || cfg.host !== HOST) {
    cfg.port = port;
    cfg.host = HOST;
    await writeConfig(p, cfg);
  }
}

// Persist the selected, successfully-bound port to config.json so hook scripts
// (which read this file to find the kernel) POST to the right place. Stale
// config from a previous run is overwritten.
try {
  await syncProjectConnection(p);
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  logger.warn(`Could not sync port to config.json: ${msg}`);
}

try {
  for (const root of await listRegisteredProjectPaths(gPaths)) {
    if (root === p.root()) continue;
    await syncProjectConnection(paths(root));
  }
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  logger.warn(`Could not sync registered project configs: ${msg}`);
}

if (!singletonDisabled) {
  try {
    await writeKernelInstanceRecord(gPaths.kernelInstanceFile(), kernelIdentity);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`Could not write kernel instance record: ${msg}`);
    await app.close();
    await releaseStartupLock();
    await cleanupGeneratedBootToken();
    process.exit(1);
  }
}
await releaseStartupLock();

// Reconcile surviving tmux sessions. Best-effort: failures must not crash
// startup. We construct a dedicated tmux manager here since createServer
// doesn't expose its own — tmux is stateless server-side, so a duplicate
// handle is fine. agentsDir comes from the active path's location: under
// ~/.config/f-mark/projects/<pathId>/agents/ for multi-path boots, falling
// back to <cwd>/.f-mark/agents/ for legacy.
try {
  const reconcileTmux = createTmuxManager({
    runner: realCommandRunner(),
    projectRoot: p.root(),
  });
  const { createAgentStateStore } = await import("./services/agentState.js");
  await reconcile({
    paths: p,
    tmux: reconcileTmux,
    tracker: getTracker(),
    agentState: createAgentStateStore({ ref: pathContextRef, fallback: p }),
  });
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`reconcile failed: ${msg}\n`);
}

const mode: BannerMode = options.remote
  ? "remote"
  : options.container
    ? "container"
    : "local";

console.log(
  renderBanner({
    mode,
    port,
    token,
    hostname: hostname(),
    user: process.env.USER ?? process.env.USERNAME ?? "user",
    sshHint: process.env.SSH_CONNECTION !== undefined && !options.remote,
    allowProcessApiNoAuth: options.allowProcessApiNoAuth,
  }),
);

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});
process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});
