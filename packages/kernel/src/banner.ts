import process from "node:process";
import { VERSION } from "./config.js";

export type BannerMode = "local" | "remote" | "container";

export interface BannerInput {
  mode: BannerMode;
  port: number;
  token: string | null;
  hostname: string;
  user: string;
  sshHint: boolean;
  /**
   * True when both `--no-auth` and `--allow-process-api-no-auth` are active.
   * Triggers a loud warning line in the banner.
   */
  allowProcessApiNoAuth?: boolean;
}

const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  italic: "\x1b[3m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  magenta: "\x1b[35m",
};

function wrap(open: string, text: string): string {
  return process.stdout.isTTY ? `${open}${text}${ANSI.reset}` : text;
}

const bold = (s: string): string => wrap(ANSI.bold, s);
const dim = (s: string): string => wrap(ANSI.dim, s);
const italic = (s: string): string => wrap(ANSI.italic, s);
const cyan = (s: string): string => wrap(ANSI.cyan, s);
const green = (s: string): string => wrap(ANSI.green, s);
const yellow = (s: string): string => wrap(ANSI.yellow, s);
const magenta = (s: string): string => wrap(ANSI.magenta, s);

function authLine(token: string | null): string {
  return token === null
    ? `  ${dim("Auth:")}     ${yellow("DISABLED (--no-auth)")}`
    : `  ${dim("Token:")}    ${yellow(token)}`;
}

function openUrl(port: number, token: string | null): string {
  const base = `http://localhost:${port}`;
  return token === null ? base : `${base}?token=${token}`;
}

function hintBlock(input: BannerInput): string[] {
  if (!input.sshHint) return [];
  return [
    `  ${italic(
      "Hint: looks like you're on SSH — you may want to run with --remote.",
    )}`,
    "",
  ];
}

function title(text: string): string {
  return `${magenta("◆")} ${bold(text)}`;
}

function localBanner(input: BannerInput): string {
  const { port, token } = input;
  return [
    title(`F-Mark v${VERSION} running.`),
    "",
    ...hintBlock(input),
    `  ${dim("URL:")}      ${cyan(`http://localhost:${port}`)}`,
    authLine(token),
    "",
    `  ${dim("Open:")}     ${cyan(openUrl(port, token))}`,
    "",
    `  ${dim("Press Ctrl+C to stop.")}`,
  ].join("\n");
}

function remoteBanner(input: BannerInput): string {
  const { port, token, hostname, user } = input;
  const sshCmd = `ssh -fN -L ${port}:localhost:${port} ${user}@${hostname}`;
  const stopCmd = `pkill -f 'ssh -fN -L ${port}:localhost:${port}'`;
  return [
    title(`F-Mark v${VERSION} running on ${hostname}.`),
    "",
    ...hintBlock(input),
    `  ${dim("URL:")}      ${cyan(`http://localhost:${port}`)} ${dim("(on this machine)")}`,
    authLine(token),
    "",
    `  ${dim("From your laptop — start a detached SSH tunnel:")}`,
    "",
    `    ${green(sshCmd)}`,
    "",
    `  ${dim("Then open:")} ${cyan(openUrl(port, token))}`,
    "",
    `  ${dim("Stop the tunnel later with:")}`,
    "",
    `    ${green(stopCmd)}`,
    "",
    `  ${dim(italic("Tip: VS Code / Cursor Remote-SSH forwards ports automatically — skip the ssh step."))}`,
    "",
    `  ${dim("Press Ctrl+C to stop F-Mark.")}`,
  ].join("\n");
}

function containerBanner(input: BannerInput): string {
  const { port, token } = input;
  return [
    title(`F-Mark v${VERSION} running.`),
    "",
    ...hintBlock(input),
    `  ${dim("URL:")}      ${cyan(`http://localhost:${port}`)} ${dim("(inside the container)")}`,
    authLine(token),
    "",
    `  ${dim(`Map port ${port} to your host. For example:`)}`,
    `    ${green(`docker run -p ${port}:${port} <image>`)}`,
    `  ${dim("Or in docker-compose.yml:")}`,
    `    ${green("ports:")}`,
    `    ${green(`  - "${port}:${port}"`)}`,
    "",
    `  ${dim("Then open:")} ${cyan(openUrl(port, token))}`,
    "",
    `  ${dim("Press Ctrl+C to stop.")}`,
  ].join("\n");
}

function processApiWarning(input: BannerInput): string | null {
  // Only warn when the dangerous combination is actually active: auth is off
  // AND the operator explicitly enabled the process-spawning API.
  if (input.token === null && input.allowProcessApiNoAuth === true) {
    const line =
      "WARNING: --no-auth + --allow-process-api-no-auth allows ANY client on this port to spawn processes.";
    return `  ${yellow(bold(line))}`;
  }
  return null;
}

export function renderBanner(input: BannerInput): string {
  let body: string;
  switch (input.mode) {
    case "local":
      body = localBanner(input);
      break;
    case "remote":
      body = remoteBanner(input);
      break;
    case "container":
      body = containerBanner(input);
      break;
  }
  const warning = processApiWarning(input);
  if (warning === null) return body;
  return `${body}\n\n${warning}`;
}
