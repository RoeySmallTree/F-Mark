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
}

function italic(text: string): string {
  return process.stdout.isTTY ? `\x1b[3m${text}\x1b[0m` : text;
}

function authLine(token: string | null): string {
  return token === null
    ? "  Auth:     DISABLED (--no-auth)"
    : `  Token:    ${token}`;
}

function openUrl(port: number, token: string | null): string {
  return token === null
    ? `http://localhost:${port}`
    : `http://localhost:${port}?token=${token}`;
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

function localBanner(input: BannerInput): string {
  const { port, token } = input;
  return [
    `F-Mark v${VERSION} running.`,
    "",
    ...hintBlock(input),
    `  URL:      http://localhost:${port}`,
    authLine(token),
    "",
    `  Open: ${openUrl(port, token)}`,
    "",
    "  Press Ctrl+C to stop.",
  ].join("\n");
}

function remoteBanner(input: BannerInput): string {
  const { port, token, hostname, user } = input;
  return [
    `F-Mark v${VERSION} running on ${hostname}.`,
    "",
    ...hintBlock(input),
    `  URL:      http://localhost:${port} (on this machine)`,
    authLine(token),
    "",
    "  To access from your laptop, open a new terminal and run:",
    "",
    `    ssh -L ${port}:localhost:${port} ${user}@${hostname}`,
    "",
    `  Then open: ${openUrl(port, token)}`,
    "",
    "  Tip: If you use VS Code or Cursor with Remote-SSH, the port forwards",
    "  automatically — you can skip the ssh -L command above.",
    "",
    "  Press Ctrl+C to stop.",
  ].join("\n");
}

function containerBanner(input: BannerInput): string {
  const { port, token } = input;
  return [
    `F-Mark v${VERSION} running.`,
    "",
    ...hintBlock(input),
    `  URL:      http://localhost:${port} (inside the container)`,
    authLine(token),
    "",
    `  To access from your host, ensure port ${port} is mapped. For example:`,
    `    docker run -p ${port}:${port} <image>`,
    "  Or in docker-compose.yml:",
    "    ports:",
    `      - "${port}:${port}"`,
    "",
    `  Then open: ${openUrl(port, token)}`,
    "",
    "  Press Ctrl+C to stop.",
  ].join("\n");
}

export function renderBanner(input: BannerInput): string {
  switch (input.mode) {
    case "local":
      return localBanner(input);
    case "remote":
      return remoteBanner(input);
    case "container":
      return containerBanner(input);
  }
}
