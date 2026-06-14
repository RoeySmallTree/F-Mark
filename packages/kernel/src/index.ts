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
import { DEFAULT_PORT, HOST, MAX_PORT_RETRIES } from "./config.js";
import * as logger from "./logger.js";
import { mkdir } from "node:fs/promises";
import { paths } from "./paths.js";
import { activePaths } from "./paths/active.js";
import { PathContextRef } from "./paths/contextRef.js";
import { globalPaths } from "./paths/global.js";
import { registerProjectPath } from "./paths/registry.js";
import { bumpRevision, mruPush, updateState } from "./state/store.js";
import { runV04Migration } from "./boot/migration.js";
import { initProject, readConfig, writeConfig } from "./project.js";
import { reconcile } from "./reconcile.js";
import { createServer } from "./server.js";
import { realCommandRunner } from "./tmux/commandRunner.js";
import { createTmuxManager } from "./tmux/manager.js";

function hasErrnoCode(err: unknown, code: string): boolean {
  return (
    err instanceof Error &&
    "code" in err &&
    (err as NodeJS.ErrnoException).code === code
  );
}

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
const projectRoot = options.path ?? process.env.INIT_CWD ?? process.cwd();
const p = paths(projectRoot);
const requestedPort = options.port ?? DEFAULT_PORT;
await initProject(p, requestedPort);

// P1 transitional: cwd (or --path) is the active path so existing UI/hooks
// keep working. Removed in P4 once the picker UI is in place.
const gPaths = globalPaths();
await mkdir(gPaths.configDir(), { recursive: true });

// One-shot v0.4 → v0.5 migration. No-op when state.json already exists.
// On first run, moves <cwd>/.f-mark/agents/, runtimes.json, and splits
// config.json into the global tree under ~/.config/f-mark/projects/<pathId>/.
try {
  await runV04Migration(projectRoot, gPaths);
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`v0.4 migration failed: ${msg}\n`);
}

const pathContextRef = new PathContextRef({
  global: gPaths,
  active: activePaths(projectRoot),
});

// Persist the boot-time active path to state.json so the renderer (and any
// PathSwitcher dropdown) sees it immediately. Also push to knownPaths so it
// shows up under recents on the next launch. (After migration this is a
// no-op when state.json was just initialized by the shim.)
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

const { app, getBus, getTracker } = createServer({
  token,
  paths: p,
  allowProcessApiNoAuth: options.allowProcessApiNoAuth,
  pathContextRef,
  quietCrossPathHooks: options.quietCrossPathHooks,
});

let port = requestedPort;
let bound = false;
for (let attempt = 0; attempt < MAX_PORT_RETRIES; attempt++) {
  try {
    await app.listen({ port, host: HOST });
    bound = true;
    break;
  } catch (err) {
    if (hasErrnoCode(err, "EADDRINUSE")) {
      port++;
      continue;
    }
    throw err;
  }
}

if (!bound) {
  logger.error(
    `Could not bind to any port in range ${requestedPort}..${port - 1}`,
  );
  // Only clean up a token THIS boot generated, and only if the file still
  // holds OUR token — never clobber a persisted token that predates this boot
  // or one a concurrently-booting kernel may now own.
  if (token !== null && tokenGenerated) {
    const onDisk = await readExistingToken(p);
    if (onDisk === token) await deleteTokenFile(p);
  }
  process.exit(1);
}

// Persist the actually-bound port to config.json so hook scripts (which read
// this file to find the kernel) POST to the right place. Covers both the
// --port flag case and the EADDRINUSE port-bump case. Stale config from a
// previous run is overwritten.
try {
  const cfg = await readConfig(p);
  if (cfg.port !== port) {
    cfg.port = port;
    await writeConfig(p, cfg);
  }
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  logger.warn(`Could not sync port to config.json: ${msg}`);
}

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

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`Received ${signal}. Shutting down...`);
  await app.close();
  // Intentionally DO NOT delete the token file. It is a stable project
  // credential reused across restarts (see resolveBootToken); deleting it
  // here would strand long-lived agents that outlive the kernel and the
  // agents re-adopted by the next boot's reconcile step (→ 401s).
  process.exit(0);
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});
process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});
