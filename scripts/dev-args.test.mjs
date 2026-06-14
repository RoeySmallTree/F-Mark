#!/usr/bin/env node
import assert from "node:assert/strict";
import { normalizeArgs } from "./dev.mjs";

const normalize = (argv, env = {}) => normalizeArgs(argv, env);

assert.deepEqual(normalize(["--remote"]), ["--remote"]);
assert.deepEqual(normalize(["--remote=true"]), ["--remote"]);
assert.deepEqual(normalize(["--remote=false"], { npm_config_remote: "true" }), []);

assert.deepEqual(normalize(["--port=9090"]), ["--port", "9090"]);
assert.deepEqual(normalize([], { npm_config_port: "9090" }), [
  "--port",
  "9090",
]);

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

console.log("dev arg normalization tests passed");
