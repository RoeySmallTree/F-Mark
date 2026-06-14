#!/usr/bin/env node
import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

function parseJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

const output = process.env.FMARK_PHASE16_HOOK_LOG;
const stdin = await readStdin();
const record = {
  ts: new Date().toISOString(),
  argv: process.argv.slice(2),
  event_hint: process.argv[2] ?? null,
  cwd: process.cwd(),
  env: {
    CLAUDE_PROJECT_DIR: process.env.CLAUDE_PROJECT_DIR ?? null,
    CODEX_HOME: process.env.CODEX_HOME ?? null,
    GEMINI_CLI_HOME: process.env.GEMINI_CLI_HOME ?? null,
    HOME: process.env.HOME ?? null,
  },
  stdin_raw: stdin,
  stdin_json: parseJson(stdin),
};

if (output) {
  await mkdir(dirname(output), { recursive: true });
  await appendFile(output, `${JSON.stringify(record)}\n`, "utf8");
}

const response = process.env.FMARK_PHASE16_HOOK_RESPONSE;
if (response !== undefined && response.trim().length > 0) {
  process.stdout.write(response);
  if (!response.endsWith("\n")) process.stdout.write("\n");
} else {
  process.stdout.write("{}\n");
}
