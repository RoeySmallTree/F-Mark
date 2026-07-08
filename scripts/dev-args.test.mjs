#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  kernelSpawnSpec,
  buildKernelChildEnv,
  normalizeArgs,
  selectedPortFromArgs,
} from "./dev.mjs";

const normalize = (argv, env = {}) => normalizeArgs(argv, env);

assert.deepEqual(normalize(["--remote"]), ["--remote"]);
assert.deepEqual(normalize(["--remote=true"]), ["--remote"]);
assert.deepEqual(normalize(["--remote=false"], { npm_config_remote: "true" }), []);

assert.deepEqual(normalize(["--port=9090"]), ["--port", "9090"]);
assert.deepEqual(normalize([], { npm_config_port: "9090" }), [
  "--port",
  "9090",
]);
assert.equal(selectedPortFromArgs(normalize([])), "7777");
assert.equal(selectedPortFromArgs(normalize(["--port=9090"])), "9090");
assert.equal(
  selectedPortFromArgs(normalize([], { npm_config_port: "9091" })),
  "9091",
);

assert.deepEqual(normalize(["--auth=false"]), ["--no-auth"]);
assert.deepEqual(normalize(["--auth", "false"]), ["--no-auth"]);
assert.deepEqual(normalize(["--auth=true"], { npm_config_no_auth: "true" }), []);
assert.deepEqual(normalize([], { npm_config_auth: "false" }), ["--no-auth"]);

assert.deepEqual(normalize(["--allow-process-api-no-auth=true"]), [
  "--allow-process-api-no-auth",
]);
assert.deepEqual(
  normalize(["--allow-process-api-no-auth=false"], {
    npm_config_allow_process_api_no_auth: "true",
  }),
  [],
);

assert.deepEqual(
  buildKernelChildEnv(
    {
      FMARK_ALLOW_MULTIPLE_KERNELS: "1",
      EXISTING: "kept",
    },
    4242,
  ),
  {
    FMARK_ALLOW_MULTIPLE_KERNELS: "1",
    EXISTING: "kept",
    FMARK_DEV_RESTART_EXIT_CODE: "78",
    FMARK_DEV_SUPERVISOR_PID: "4242",
  },
);

console.log("dev arg normalization tests passed");

// kernelSpawnSpec: kernel must run WITHOUT a pnpm wrapper (pnpm exec replaces
// exit code 78 with 1, killing the supervisor restart loop).
const spec = kernelSpawnSpec(["--remote", "--port", "7777"], "/repo");
assert.deepEqual(spec, {
  command: "/repo/packages/kernel/node_modules/.bin/tsx",
  args: ["src/index.ts", "--remote", "--port", "7777"],
  cwd: "/repo/packages/kernel",
});
assert.ok(!spec.command.includes("pnpm"));

console.log("kernel spawn spec tests passed");
