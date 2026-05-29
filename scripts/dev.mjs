#!/usr/bin/env node
import { spawn } from "node:child_process";

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

function truthy(value) {
  return value === "true" || value === "1" || value === "";
}

function normalizeArgs(argv, env) {
  const args = argv.filter((arg) => arg !== "--");
  const hasFlag = (flag) => args.includes(flag) || args.some((arg) => arg.startsWith(`${flag}=`));

  for (const [flag, envName] of booleanEnvFlags) {
    if (!hasFlag(flag) && truthy(env[envName])) args.push(flag);
  }

  if (!hasFlag("--no-auth")) {
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

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : String(err));
  process.exit(1);
});
