import { basename, normalize } from "node:path";

const EXECUTABLE_RE = /^[a-zA-Z0-9_./-]+$/;
const EXECUTABLE_MAX_LEN = 512;

// Shells and interpreters that accept -c/-e/eval-style flags: writing one of
// these into runtimes.json with `args:["-c","cmd"]` is a direct RCE. Matched
// by basename so /bin/sh, /opt/custom/sh, and ./bin/sh are all blocked.
const DENIED_EXEC_BASENAMES = new Set([
  "sh", "bash", "zsh", "dash", "ksh", "csh", "tcsh", "fish", "ash", "rbash",
  "node", "nodejs", "deno", "bun",
  "python", "python2", "python3",
  "ruby", "perl", "php", "lua",
  "awk", "gawk", "mawk", "nawk",
  "tclsh", "expect",
  "env",
]);

// Versioned interpreter names (python3.11, ruby3.1, node20, php8.2).
const DENIED_EXEC_PATTERNS = [
  /^python\d+(\.\d+)*$/,
  /^node\d+$/,
  /^ruby\d+(\.\d+)*$/,
  /^php\d+(\.\d+)*$/,
];

export function validateExecutable(value: string): void {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("invalid executable: empty");
  }
  if (value.length > EXECUTABLE_MAX_LEN) {
    throw new Error("invalid executable: too long");
  }
  if (!EXECUTABLE_RE.test(value)) {
    throw new Error(`invalid executable: ${value}`);
  }
  const normalized = normalize(value);
  if (normalized.split("/").includes("..")) {
    throw new Error("invalid executable: path traversal forbidden");
  }
  assertAllowedExecutableBasename(normalized);
}

function assertAllowedExecutableBasename(normalized: string): void {
  const base = basename(normalized).toLowerCase();
  if (
    DENIED_EXEC_BASENAMES.has(base) ||
    DENIED_EXEC_PATTERNS.some((pattern) => pattern.test(base))
  ) {
    throw new Error(`invalid executable: '${base}' is a shell or interpreter`);
  }
}
