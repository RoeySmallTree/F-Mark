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
import { paths } from "./paths.js";
import { initProject } from "./project.js";
import { reconcile } from "./reconcile.js";
import { createServer } from "./server.js";
import { realCommandRunner } from "./tmux/commandRunner.js";
import { createTmuxManager } from "./tmux/manager.js";
import { startWatcher } from "./watcher.js";

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

const p = paths(process.env.INIT_CWD ?? process.cwd());
await initProject(p);

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
});

const requestedPort = options.port ?? DEFAULT_PORT;
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

const stopWatcher = await startWatcher(p, {
  publish: (m) => getBus().publish(m),
});

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
  await stopWatcher();
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
