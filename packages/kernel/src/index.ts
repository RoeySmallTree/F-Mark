import { hostname } from "node:os";
import process from "node:process";
import {
  deleteTokenFile,
  ensureGitignoreEntry,
  generateToken,
  writeTokenFile,
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
import { bumpRevision, mruPush, updateState } from "./state/store.js";
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
if (rawArgv[0] === "hook") {
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
const pathContextRef = new PathContextRef({
  global: gPaths,
  active: activePaths(projectRoot),
});

// Persist the boot-time active path to state.json so the renderer (and any
// PathSwitcher dropdown) sees it immediately. Also push to knownPaths so it
// shows up under recents on the next launch.
await updateState(gPaths, (s) =>
  bumpRevision(mruPush({ ...s, activePath: projectRoot }, projectRoot)),
);

let token: string | null = null;
if (options.noAuth) {
  logger.warn(
    "Auth is disabled (--no-auth). Anyone with network access can use the API.",
  );
} else {
  token = options.password ?? generateToken();
  await writeTokenFile(p, token);
  await ensureGitignoreEntry(p);
}

const { app, getBus, getTracker } = createServer({
  token,
  paths: p,
  allowProcessApiNoAuth: options.allowProcessApiNoAuth,
  pathContextRef,
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
  if (token !== null) await deleteTokenFile(p);
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

// Reconcile surviving tmux sessions against .f-mark/agents/*. Best-effort: a
// reconcile failure must not crash startup. We construct a dedicated tmux
// manager here since `createServer` doesn't expose its own — tmux is stateless
// server-side, so a duplicate handle is fine.
try {
  const reconcileTmux = createTmuxManager({
    runner: realCommandRunner(),
    projectRoot: p.root(),
  });
  await reconcile({ paths: p, tmux: reconcileTmux, tracker: getTracker() });
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
  if (token !== null) await deleteTokenFile(p);
  process.exit(0);
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});
process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});
