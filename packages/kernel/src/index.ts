import { hostname } from "node:os";
import process from "node:process";
import {
  deleteTokenFile,
  ensureGitignoreEntry,
  generateToken,
  writeTokenFile,
} from "./auth.js";
import { renderBanner, type BannerMode } from "./banner.js";
import { parseArgs, printUsage, type CliOptions } from "./cli.js";
import { DEFAULT_PORT, HOST, MAX_PORT_RETRIES } from "./config.js";
import * as logger from "./logger.js";
import { paths } from "./paths.js";
import { initProject } from "./project.js";
import { createServer } from "./server.js";
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

const { app, getBus } = createServer({ token, paths: p });

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
