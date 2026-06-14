#!/usr/bin/env node
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

const booleanEnvFlags = [
  ["--remote", "npm_config_remote"],
  ["--container", "npm_config_container"],
  ["--allow-process-api-no-auth", "npm_config_allow_process_api_no_auth"],
  ["--quiet-cross-path-hooks", "npm_config_quiet_cross_path_hooks"],
];

const valueEnvFlags = [
  ["--port", "npm_config_port"],
  ["--path", "npm_config_path"],
  ["--password", "npm_config_password"],
];

const booleanFlags = new Set(booleanEnvFlags.map(([flag]) => flag));
const valueFlags = new Set(valueEnvFlags.map(([flag]) => flag));

export function truthy(value) {
  return value === "true" || value === "1" || value === "";
}

function falsey(value) {
  return value === "false" || value === "0";
}

function normalizeBooleanValue(flag, value) {
  if (truthy(value)) return [flag];
  if (falsey(value)) return [];
  return [`${flag}=${value}`];
}

function normalizeAuthValue(value, fallback) {
  if (falsey(value)) return { args: ["--no-auth"], explicitAuth: "false" };
  if (truthy(value)) return { args: [], explicitAuth: "true" };
  return { args: [fallback], explicitAuth: null };
}

function normalizeExplicitArgs(argv) {
  const args = [];
  const seen = new Set();
  let explicitAuth = null;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--") continue;

    if (arg === "--auth") {
      const value = argv[i + 1];
      if (typeof value === "string" && !value.startsWith("--")) {
        const normalized = normalizeAuthValue(value, arg);
        args.push(...normalized.args);
        explicitAuth = normalized.explicitAuth ?? explicitAuth;
        if (normalized.explicitAuth !== null) {
          seen.add("--no-auth");
          i++;
        }
        continue;
      }
      args.push(arg);
      continue;
    }

    if (arg.startsWith("--auth=")) {
      const value = arg.slice("--auth=".length);
      const normalized = normalizeAuthValue(value, arg);
      args.push(...normalized.args);
      explicitAuth = normalized.explicitAuth ?? explicitAuth;
      if (normalized.explicitAuth !== null) seen.add("--no-auth");
      continue;
    }

    const equalsIndex = arg.indexOf("=");
    if (equalsIndex > 0) {
      const flag = arg.slice(0, equalsIndex);
      const value = arg.slice(equalsIndex + 1);
      if (booleanFlags.has(flag)) {
        args.push(...normalizeBooleanValue(flag, value));
        seen.add(flag);
        continue;
      }
      if (valueFlags.has(flag)) {
        args.push(flag, value);
        seen.add(flag);
        continue;
      }
    }

    args.push(arg);
    if (booleanFlags.has(arg) || valueFlags.has(arg) || arg === "--no-auth") {
      seen.add(arg);
    }
  }

  return { args, seen, explicitAuth };
}

export function normalizeArgs(argv, env) {
  const normalized = normalizeExplicitArgs(argv);
  const args = [...normalized.args];
  const hasFlag = (flag) => normalized.seen.has(flag);

  for (const [flag, envName] of booleanEnvFlags) {
    if (!hasFlag(flag) && truthy(env[envName])) args.push(flag);
  }

  if (!hasFlag("--no-auth") && normalized.explicitAuth !== "true") {
    if (truthy(env.npm_config_no_auth) || env.npm_config_auth === "false") {
      args.push("--no-auth");
    }
  }

  for (const [flag, envName] of valueEnvFlags) {
    const value = env[envName];
    if (!hasFlag(flag) && typeof value === "string" && value.length > 0) {
      args.push(flag, value);
    }
  }

  return args;
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: process.platform === "win32",
      ...options,
    });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      resolve({ code: code ?? (signal === null ? 0 : 1), signal });
    });
  });
}

function spawnManaged(command, args) {
  return spawn(command, args, {
    stdio: "inherit",
    detached: process.platform !== "win32",
    shell: process.platform === "win32",
  });
}

function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  try {
    if (process.platform === "win32") {
      child.kill("SIGTERM");
    } else {
      process.kill(-child.pid, "SIGTERM");
    }
  } catch {
    // The child may already be gone.
  }
}

async function main() {
  const kernelArgs = normalizeArgs(process.argv.slice(2), process.env);
  const kernelCommand = ["-F", "f-mark", "exec", "tsx", "src/index.ts", ...kernelArgs];

  if (kernelArgs.includes("--help") || kernelArgs.includes("-h")) {
    const result = await run("pnpm", kernelCommand);
    process.exit(result.code);
  }

  const build = await run("pnpm", ["-F", "@f-mark/renderer", "build"]);
  if (build.code !== 0) process.exit(build.code);

  const renderer = spawnManaged("pnpm", ["-F", "@f-mark/renderer", "dev:bundled"]);
  const kernel = spawnManaged("pnpm", kernelCommand);
  const children = [renderer, kernel];

  const cleanup = () => {
    for (const child of children) stop(child);
  };
  process.once("SIGINT", () => {
    cleanup();
    process.exit(130);
  });
  process.once("SIGTERM", () => {
    cleanup();
    process.exit(143);
  });
  process.once("exit", cleanup);

  const result = await new Promise((resolve) => {
    kernel.once("close", (code, signal) => resolve({ code, signal }));
  });
  cleanup();
  process.exit(result.code ?? (result.signal === null ? 0 : 1));
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.stack : String(err));
    process.exit(1);
  });
}
