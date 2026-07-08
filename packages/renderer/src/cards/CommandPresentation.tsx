import type { JSX, ReactNode } from "react";
import { CodeBlock, isRecord } from "./ToolPresentationParts.js";

export interface AccessItem {
  target: string;
  access: "read" | "write" | "execute" | "process inspect" | "process env read" | "reference";
}

interface ShellSegment {
  raw: string;
  connectorBefore: "start" | "pipe" | "sequence" | "and" | "or";
}

interface ParsedCommandStage extends ShellSegment {
  command: string;
  args: string[];
  paths: AccessItem[];
  flags: string[];
}

interface CommandDictionaryEntry {
  tooltip: string;
  flags?: Record<string, string>;
}

const shellConnectors = {
  start: "start",
  pipe: "pipe",
  sequence: "sequence",
  and: "and",
  or: "or",
} as const satisfies Record<string, ShellSegment["connectorBefore"]>;

const shellWrapperCommands = {
  sudo: "sudo",
  command: "command",
  env: "env",
} as const;

const accessKinds = {
  read: "read",
  write: "write",
  execute: "execute",
  processInspect: "process inspect",
  processEnvRead: "process env read",
  reference: "reference",
} as const satisfies Record<string, AccessItem["access"]>;

const shellFlags = {
  grepPattern: "-e",
  grepRegexp: "--regexp",
  lineCount: "-n",
  nodeInlineCode: "-e",
  runtimeInlineCode: "-c",
  nodeInlineLetter: "e",
  pythonInlineLetter: "c",
  uniqueSort: "u",
} as const;

const commandNames = {
  node: "node",
  python: "python",
  python3: "python3",
} as const;

const runtimeLanguageLabels = {
  javaScriptCode: "JavaScript code",
  pythonCode: "Python code",
  javaScript: "JavaScript",
  nodeJs: "Node.js",
  python: "Python",
} as const;

const commandCopy = {
  noEchoPayload: "text",
  fallbackCommand: "a command",
  grepPipedOutput: "search that output",
  grepText: "search text",
  awkProgram: "an awk program",
  trSource: "characters",
  trTarget: "other characters",
  filesOrDirectories: "files or directories",
  folders: "folders",
  providedParameters: "the provided parameters",
  defaultLineCount: "10",
} as const;

const lineWindowPositions = {
  first: "first",
  last: "last",
} as const;

const connectorPrefixes = {
  [shellConnectors.pipe]: "Take the previous command's output and ",
  [shellConnectors.and]: "If the previous command succeeds, ",
  [shellConnectors.or]: "If the previous command fails, ",
  [shellConnectors.sequence]: "Then ",
  [shellConnectors.start]: "",
} as const satisfies Record<ShellSegment["connectorBefore"], string>;

const shellIntroCopy = {
  additionalStepsSingular: "more step",
  additionalStepsPlural: "more steps",
  and: "and",
  archive: "archive",
  buildCommandsFromInput: "Build commands from piped input",
  changeDirectory: "Change directory to",
  changeOwnership: "Change ownership on",
  changePermissions: "Change permissions on",
  checkNetwork: "Check network reachability for",
  command: "command",
  copy: "Copy",
  createArchive: "Create archive",
  createFolder: "Create folder",
  createOrUpdate: "Create or update",
  download: "Download",
  editOrFilter: "Edit or filter text from",
  empty: "",
  extractArchive: "Extract archive",
  extractOrReshape: "Extract or reshape fields from text",
  fetchUrl: "Fetch",
  filterJson: "Filter JSON output",
  findExecutable: "Find executable path for",
  findProcesses: "Find processes matching",
  folders: "folders",
  in: "in",
  inspectContainers: "Run Docker command",
  inspectSockets: "Inspect sockets and connections",
  listFiles: "List files",
  listProcesses: "List running processes",
  matchingPaths: "Find matching paths in",
  more: "more",
  moveOrRename: "Move or rename",
  output: "output",
  packageCommand: "Run package command",
  printCurrentDirectory: "Print the current directory",
  printText: "Print text to the terminal",
  readFile: "Read file",
  remove: "Remove",
  repositoryCommand: "Run Git command",
  run: "Run",
  runInlineCode: "Run inline code with",
  runScript: "Run script",
  runSecureShell: "Open secure shell to",
  searchText: "Search text for",
  showFirst: "Show first",
  showLast: "Show last",
  showLines: "Show lines",
  sortLines: "Sort lines",
  terminal: "terminal",
  translateCharacters: "Translate characters",
  unknownShellCommand: "Run shell command",
  writeOutput: "Write terminal output to",
} as const;

const shellFlagValueNames = new Set([
  "e",
  "F",
  "name",
  "regexp",
  "type",
  "X",
  "W",
]);

const packageManagers = new Set(["bun", "npm", "pnpm", "yarn"]);
const runtimeCommands = new Set(["node", "python", "python3", "tsx"]);
const archiveCreateCommands = new Set(["tar", "zip"]);
const shellSyntaxTokens = {
  redirect: ">",
  redirectAppend: ">>",
  redirectStderr: "2>",
  run: "run",
} as const;

const COMMAND_DICTIONARY: Record<string, CommandDictionaryEntry> = {
  awk: {
    tooltip: "Extract or reshape fields from text.",
    flags: { F: "use a custom field separator" },
  },
  bun: { tooltip: "Run Bun scripts or JavaScript tooling." },
  cat: { tooltip: "Print file contents." },
  cd: { tooltip: "Change the current working directory." },
  chmod: { tooltip: "Change file permissions." },
  chown: { tooltip: "Change file ownership." },
  cp: { tooltip: "Copy files or folders." },
  curl: {
    tooltip: "Send an HTTP request.",
    flags: {
      f: "fail on HTTP errors",
      I: "fetch headers only",
      L: "follow redirects",
      s: "run silently",
      X: "use a specific HTTP method",
    },
  },
  docker: { tooltip: "Run Docker containers or image tooling." },
  echo: { tooltip: "Print text to the terminal." },
  env: { tooltip: "Run a command with environment variables." },
  find: {
    tooltip: "Walk folders and match paths.",
    flags: { name: "match by name", type: "filter by filesystem type" },
  },
  git: { tooltip: "Run Git repository tooling." },
  grep: {
    tooltip: "Search text for matching lines.",
    flags: {
      E: "use extended regular expressions",
      e: "read the search pattern from the next argument",
      i: "ignore case",
      l: "list matching files",
      n: "include line numbers",
      o: "show only matching text",
      r: "search recursively",
      R: "follow directories recursively",
      v: "invert the match",
    },
  },
  head: {
    tooltip: "Show the first lines of output.",
    flags: { n: "choose how many lines to show" },
  },
  jq: { tooltip: "Filter or format JSON." },
  ls: {
    tooltip: "List files or directories.",
    flags: { a: "include hidden files", l: "show a detailed listing" },
  },
  mkdir: { tooltip: "Create directories.", flags: { p: "create parent directories" } },
  mv: { tooltip: "Move or rename files." },
  node: {
    tooltip: "Run JavaScript with Node.js.",
    flags: { e: "run inline JavaScript code" },
  },
  npm: { tooltip: "Run npm package scripts or commands." },
  pgrep: {
    tooltip: "Find processes by name or pattern.",
    flags: {
      a: "show the full command line",
      f: "match against the full command line",
      l: "show process names",
    },
  },
  ping: {
    tooltip: "Probe network reachability.",
    flags: {
      c: "send a fixed number of packets",
      W: "wait this many seconds for a response",
    },
  },
  pnpm: { tooltip: "Run pnpm package scripts or commands." },
  ps: { tooltip: "List running processes." },
  pwd: { tooltip: "Print the current working directory." },
  python: {
    tooltip: "Run a Python script.",
    flags: { c: "run inline Python code" },
  },
  python3: {
    tooltip: "Run a Python 3 script.",
    flags: { c: "run inline Python code" },
  },
  rg: {
    tooltip: "Search files quickly with ripgrep.",
    flags: {
      i: "ignore case",
      l: "list matching files",
      n: "include line numbers",
      o: "show only matching text",
      type: "search a named file type",
    },
  },
  rm: { tooltip: "Remove files or folders.", flags: { f: "force removal", r: "remove recursively" } },
  sed: {
    tooltip: "Edit or filter text streams.",
    flags: { E: "use extended regular expressions", n: "suppress automatic printing" },
  },
  sort: { tooltip: "Sort lines of text.", flags: { u: "remove duplicate lines" } },
  ssh: { tooltip: "Open a secure shell connection." },
  ss: {
    tooltip: "Inspect listening sockets and connections.",
    flags: {
      l: "show listening sockets",
      n: "show numeric addresses",
      p: "show owning processes",
      t: "show TCP sockets",
      u: "show UDP sockets",
    },
  },
  tail: {
    tooltip: "Show the last lines of output.",
    flags: { n: "choose how many lines to show" },
  },
  tar: { tooltip: "Create or extract tar archives." },
  tee: { tooltip: "Write output to a file and stdout." },
  timeout: { tooltip: "Run another command with a time limit." },
  touch: { tooltip: "Create a file or update its timestamp." },
  tr: { tooltip: "Translate or delete characters in text." },
  tsx: { tooltip: "Run TypeScript or TSX with the tsx runner." },
  unzip: { tooltip: "Extract a zip archive." },
  wget: { tooltip: "Download a URL." },
  which: { tooltip: "Find the executable path for a command." },
  xargs: { tooltip: "Build commands from piped input." },
  yarn: { tooltip: "Run Yarn package scripts or commands." },
  zip: { tooltip: "Create a zip archive." },
};

function fileNameFromPath(path: string | undefined): string | undefined {
  if (path === undefined) return undefined;
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts.at(-1) ?? path;
}

function stringFromInput(input: unknown, keys: string[]): string | undefined {
  if (!isRecord(input)) return undefined;
  for (const key of keys) {
    const value = input[key];
    if (typeof value === "string" && value.trim().length > 0) return value;
  }
  return undefined;
}

function firstShellToken(line: string): string | undefined {
  const match = /^\s*(?:[A-Z_][A-Z0-9_]*=\S+\s+)*([./~\w-]+)/.exec(line);
  return match?.[1];
}

function lineLooksLikeShell(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length === 0) return false;
  if (/[|;&<>`$"'()[\]{}]/.test(trimmed)) return true;
  if (/^(?:\.{0,2}\/|~\/|\/)/.test(trimmed)) return true;
  const token = firstShellToken(trimmed);
  if (token === undefined) return false;
  const lower = fileNameFromPath(token)?.toLowerCase() ?? token.toLowerCase();
  return token === token.toLowerCase() && COMMAND_DICTIONARY[lower] !== undefined;
}

export function splitCommandAndReason(
  command: string,
  explicitReason: string | undefined,
): { command: string; reason?: string } {
  if (explicitReason !== undefined) return { command, reason: explicitReason };
  const lines = command
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const last = lines.at(-1);
  if (
    lines.length > 1 &&
    last !== undefined &&
    /\s/.test(last) &&
    !lineLooksLikeShell(last)
  ) {
    lines.pop();
    return { command: lines.join("\n"), reason: last };
  }
  return { command };
}

function splitShellSegments(command: string): ShellSegment[] {
  return new ShellSegmentParser(command).parse();
}

class ShellSegmentParser {
  private readonly text: string;
  private segments: ShellSegment[] = [];
  private current = "";
  private quote: "'" | '"' | "`" | null = null;
  private escaped = false;
  private connectorBefore: ShellSegment["connectorBefore"] = shellConnectors.start;

  constructor(command: string) {
    this.text = command.replace(/\\\r?\n/g, " ").replace(/\r?\n/g, " ");
  }

  parse(): ShellSegment[] {
    for (let index = 0; index < this.text.length; index += 1) {
      index = this.scanCharacter(index);
    }
    this.flush(shellConnectors.sequence);
    return this.segments.slice(0, 14);
  }

  private scanCharacter(index: number): number {
    const character = this.text[index]!;
    const next = this.text[index + 1];
    if (this.consumeEscaped(character)) return index;
    if (this.beginEscape(character)) return index;
    if (this.scanQuoted(character)) return index;
    if (this.openQuote(character)) return index;
    return this.scanConnector(character, next, index);
  }

  private consumeEscaped(character: string): boolean {
    if (!this.escaped) return false;
    this.current += character;
    this.escaped = false;
    return true;
  }

  private beginEscape(character: string): boolean {
    if (character !== "\\") return false;
    this.current += character;
    this.escaped = true;
    return true;
  }

  private scanQuoted(character: string): boolean {
    if (this.quote === null) return false;
    this.current += character;
    if (character === this.quote) this.quote = null;
    return true;
  }

  private openQuote(character: string): boolean {
    if (character !== "'" && character !== '"' && character !== "`") {
      return false;
    }
    this.quote = character;
    this.current += character;
    return true;
  }

  private scanConnector(
    character: string,
    next: string | undefined,
    index: number,
  ): number {
    if (character === "|" && next === "|") {
      this.flush(shellConnectors.or);
      return index + 1;
    }
    if (character === "&" && next === "&") {
      this.flush(shellConnectors.and);
      return index + 1;
    }
    if (character === "|") {
      this.flush(shellConnectors.pipe);
      return index;
    }
    if (character === ";") {
      this.flush(shellConnectors.sequence);
      return index;
    }
    this.current += character;
    return index;
  }

  private flush(nextConnector: ShellSegment["connectorBefore"]): void {
    const trimmed = this.current.trim();
    if (trimmed.length > 0) {
      this.segments.push({ raw: trimmed, connectorBefore: this.connectorBefore });
      this.connectorBefore = nextConnector;
    }
    this.current = "";
  }
}

function shellTokens(segment: string): string[] {
  return new ShellTokenParser(segment).parse();
}

class ShellTokenParser {
  private tokens: string[] = [];
  private current = "";
  private quote: "'" | '"' | "`" | null = null;
  private escaped = false;

  constructor(private readonly segment: string) {}

  parse(): string[] {
    for (let index = 0; index < this.segment.length; index += 1) {
      this.scanCharacter(this.segment[index]!);
    }
    this.flushCurrent();
    return this.tokens;
  }

  private scanCharacter(character: string): void {
    if (this.consumeEscaped(character)) return;
    if (this.beginEscape(character)) return;
    if (this.scanQuoted(character)) return;
    if (this.openQuote(character)) return;
    if (this.scanWhitespace(character)) return;
    this.current += character;
  }

  private consumeEscaped(character: string): boolean {
    if (!this.escaped) return false;
    this.current += character;
    this.escaped = false;
    return true;
  }

  private beginEscape(character: string): boolean {
    if (character !== "\\") return false;
    this.current += character;
    this.escaped = true;
    return true;
  }

  private scanQuoted(character: string): boolean {
    if (this.quote === null) return false;
    this.current += character;
    if (character === this.quote) this.quote = null;
    return true;
  }

  private openQuote(character: string): boolean {
    if (character !== "'" && character !== '"' && character !== "`") {
      return false;
    }
    this.quote = character;
    this.current += character;
    return true;
  }

  private scanWhitespace(character: string): boolean {
    if (!/\s/.test(character)) return false;
    this.flushCurrent();
    return true;
  }

  private flushCurrent(): void {
    if (this.current.length > 0) this.tokens.push(this.current);
    this.current = "";
  }
}

function unquote(value: string): string {
  return value.replace(/^['"]|['"]$/g, "");
}

function isEnvAssignment(token: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*=/.test(token);
}

function commandStart(tokens: string[]): number {
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i]!;
    if (isEnvAssignment(token)) continue;
    if (token === shellWrapperCommands.sudo || token === shellWrapperCommands.command) continue;
    if (token === shellWrapperCommands.env) continue;
    return i;
  }
  return 0;
}

function commandNameForTokens(tokens: string[]): string {
  const start = commandStart(tokens);
  const token = tokens[start] ?? "";
  return fileNameFromPath(unquote(token)) ?? unquote(token);
}

function flagLetters(token: string): string[] {
  if (!/^-[A-Za-z]+$/.test(token) || token.startsWith("--")) return [];
  return token.slice(1).split("");
}

function flagsForTokens(tokens: string[]): string[] {
  const flags = new Set<string>();
  for (const token of tokens) {
    if (token.startsWith("--")) {
      flags.add(token.slice(2).split("=")[0] ?? token.slice(2));
      continue;
    }
    for (const letter of flagLetters(token)) flags.add(letter);
  }
  return [...flags];
}

function flagDescriptions(command: string, flags: string[]): string[] {
  const flagMap = COMMAND_DICTIONARY[command]?.flags ?? {};
  return flags.map((flag) => flagMap[flag] ?? `use -${flag}`);
}

function cleanPathCandidate(path: string): string | null {
  const cleaned = path
    .replace(/^['"]|['"]$/g, "")
    .replace(/[),.;]+$/g, "")
    .trim();
  if (cleaned.length === 0) return null;
  if (cleaned === "/dev/null") return null;
  if (cleaned.includes("|")) return null;
  if (/^[a-z][a-z0-9+.-]+:\/\//i.test(cleaned)) return null;
  return cleaned;
}

function commandPaths(command: string): string[] {
  const paths = new Set<string>();
  const re =
    /"([^"]*(?:\/|~\/|\.\.?\/)[^"]*)"|'([^']*(?:\/|~\/|\.\.?\/)[^']*)'|((?:~\/|\.{1,2}\/|\/)[^\s'"`|;&<>),]+)|([A-Za-z0-9_.-]+\/[^\s'"`|;&<>),]+)/g;
  for (const match of command.matchAll(re)) {
    const raw = match[1] ?? match[2] ?? match[3] ?? match[4];
    if (raw === undefined) continue;
    const cleaned = cleanPathCandidate(raw);
    if (cleaned !== null) paths.add(cleaned);
  }
  return [...paths].slice(0, 16);
}

function commandLooksMutating(command: string): boolean {
  const lower = command.toLowerCase();
  return (
    /\b(apply_patch|chmod|chown|cp|mkdir|mv|rm|tee|touch)\b/.test(lower) ||
    /(^|[^12])>\s*(?![>&]|\/dev\/null)/.test(command)
  );
}

function inferAccessForPath(command: string, path: string): AccessItem["access"] {
  const lower = command.toLowerCase();
  if (path.startsWith("/proc/")) {
    return path.includes("/environ") ? accessKinds.processEnvRead : accessKinds.processInspect;
  }
  if (/\/\.bin\//.test(path) || /(?:^|\/)(node|tsx|python3?|bash|sh)$/.test(path)) {
    return accessKinds.execute;
  }
  if (commandLooksMutating(command)) return accessKinds.write;
  if (/\b(grep|rg|cat|head|tail|ls|find|stat|sed|awk|jq)\b/.test(lower)) {
    return accessKinds.read;
  }
  return accessKinds.reference;
}

function accessItemsForSegment(segment: string): AccessItem[] {
  const items = new Map<string, AccessItem>();
  for (const path of commandPaths(segment)) {
    items.set(path, { target: path, access: inferAccessForPath(segment, path) });
  }
  return [...items.values()];
}

function parseStage(segment: ShellSegment): ParsedCommandStage {
  const tokens = shellTokens(segment.raw);
  const start = commandStart(tokens);
  const command = commandNameForTokens(tokens).toLowerCase();
  const args = tokens.slice(start + 1);
  return {
    ...segment,
    command,
    args,
    paths: accessItemsForSegment(segment.raw),
    flags: flagsForTokens(args),
  };
}

function parseCommand(command: string): ParsedCommandStage[] {
  return splitShellSegments(command).map(parseStage);
}

function codeValue(value: string): JSX.Element {
  return <code className="tool-inline-code">{value}</code>;
}

function PathChip({ item }: { item: AccessItem }): JSX.Element {
  return (
    <span className="tool-path-chip" data-access={item.access} title={item.target}>
      <span>{item.access}</span>
      <code>{item.target}</code>
    </span>
  );
}

function PathChipList({ paths }: { paths: AccessItem[] }): JSX.Element | null {
  if (paths.length === 0) return null;
  return (
    <span className="tool-path-chip-list">
      {paths.map((path) => (
        <PathChip item={path} key={`${path.access}-${path.target}`} />
      ))}
    </span>
  );
}

function CommandChip({
  command,
  compact = false,
}: {
  command: string;
  compact?: boolean;
}): JSX.Element {
  const tooltip =
    COMMAND_DICTIONARY[command]?.tooltip ??
    `Perform the ${command} command with the provided parameters.`;
  return (
    <span
      className={`tool-command-chip${compact ? " compact" : ""}`}
      data-command={command}
      data-tooltip={tooltip}
      tabIndex={0}
      title={tooltip}
    >
      {command}
    </span>
  );
}

function quotedPayload(args: string[]): string | undefined {
  const first = args.find((arg) => !arg.startsWith("-") && !/[<>]/.test(arg));
  return first !== undefined ? unquote(first) : undefined;
}

function grepPatternAndPaths(stage: ParsedCommandStage): {
  pattern?: string;
  paths: AccessItem[];
} {
  const args = stage.args.filter((arg) => !/^\d?>/.test(arg));
  let pattern: string | undefined;
  const pathValues = new Set(stage.paths.map((path) => path.target));
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]!;
    if (arg === shellFlags.grepPattern || arg === shellFlags.grepRegexp) {
      pattern = unquote(args[i + 1] ?? "");
      i += 1;
      continue;
    }
    if (arg.startsWith("-")) continue;
    const clean = cleanPathCandidate(unquote(arg));
    if (clean !== null && pathValues.has(clean)) continue;
    if (pattern === undefined) {
      pattern = unquote(arg);
    }
  }
  return { pattern, paths: stage.paths.filter((path) => path.access === accessKinds.read) };
}

function humanPattern(pattern: string | undefined): string {
  if (pattern === undefined || pattern.length === 0) return "the requested pattern";
  const parts = pattern
    .split(/(?<!\\)\|/)
    .map((part) =>
      part
        .replace(/\\\./g, ".")
        .replace(/\\_/g, "_")
        .replace(/http:\/\/\[[^\]]+\]\+/, "an HTTP URL")
        .replace(/:\(\[0-9\]\{4,5\}\)\//, "a port-like URL")
        .trim(),
    )
    .filter(Boolean)
    .slice(0, 5);
  if (parts.length === 0) return pattern;
  return parts.join(" or ");
}

function lineCount(args: string[], fallback: string): string {
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]!;
    if (arg === shellFlags.lineCount) return args[i + 1] ?? fallback;
    const compact = /^-(\d+)$/.exec(arg);
    if (compact !== null) return compact[1]!;
  }
  return fallback;
}

function durationToken(args: string[]): string | undefined {
  return args.find((arg) => /^\d+(?:\.\d+)?[smhd]?$/.test(arg));
}

function inlineCodeForRuntime(stage: ParsedCommandStage): { label: string; code: string } | null {
  const codeFlag =
    stage.command === commandNames.node ? shellFlags.nodeInlineCode : shellFlags.runtimeInlineCode;
  const index = stage.args.indexOf(codeFlag);
  if (index < 0) return null;
  const code = stage.args[index + 1];
  if (code === undefined) return null;
  return {
    label:
      stage.command === commandNames.node
        ? runtimeLanguageLabels.javaScriptCode
        : runtimeLanguageLabels.pythonCode,
    code: unquote(code),
  };
}

function conditionText(stage: ParsedCommandStage): string | null {
  const inlineRuntimeCode = inlineCodeForRuntime(stage) !== null;
  const flags = inlineRuntimeCode
    ? stage.flags.filter(
        (flag) =>
          !(
            (stage.command === commandNames.node && flag === shellFlags.nodeInlineLetter) ||
            (
              (stage.command === commandNames.python || stage.command === commandNames.python3) &&
              flag === shellFlags.pythonInlineLetter
            )
          ),
      )
    : stage.flags;
  const descriptions = flagDescriptions(stage.command, flags);
  if (/2>\s*\/dev\/null/.test(stage.raw)) descriptions.push("suppress errors");
  if (/>+\s*\/dev\/null/.test(stage.raw)) descriptions.push("discard output");
  if (descriptions.length === 0) return null;
  return descriptions.join(", ");
}

function connectorPrefix(stage: ParsedCommandStage): string {
  return connectorPrefixes[stage.connectorBefore];
}

function lowerInitial(value: string): string {
  return value.length === 0 ? value : `${value.slice(0, 1).toLowerCase()}${value.slice(1)}`;
}

function compactTarget(value: string | undefined): string | undefined {
  if (value === undefined || value.length === 0) return undefined;
  return fileNameFromPath(value) ?? value;
}

function compactTargetList(values: string[], fallback: string): string {
  const clean = values.map(compactTarget).filter((value): value is string => value !== undefined);
  const first = clean[0];
  if (first === undefined) return fallback;
  const moreCount = clean.length - 1;
  if (moreCount <= 0) return first;
  return `${first} ${shellIntroCopy.and} ${moreCount} ${shellIntroCopy.more}`;
}

function pathText(stage: ParsedCommandStage, fallback: string): string {
  return compactTargetList(stage.paths.map((path) => path.target), fallback);
}

function skipFlagValue(flag: string): boolean {
  const normalized = flag.replace(/^--?/, "").split("=")[0] ?? flag;
  return shellFlagValueNames.has(normalized);
}

function meaningfulArgs(stage: ParsedCommandStage): string[] {
  const args: string[] = [];
  let skipNext = false;
  for (const arg of stage.args) {
    if (skipNext) {
      skipNext = false;
      continue;
    }
    if (
      /^\d?>/.test(arg) ||
      arg === shellSyntaxTokens.redirect ||
      arg === shellSyntaxTokens.redirectAppend ||
      arg === shellSyntaxTokens.redirectStderr
    ) {
      skipNext = true;
      continue;
    }
    if (arg.startsWith("-")) {
      skipNext = skipFlagValue(arg) && !arg.includes("=");
      continue;
    }
    args.push(unquote(arg));
  }
  return args.filter((arg) => arg.length > 0);
}

function argText(stage: ParsedCommandStage, fallback: string): string {
  return compactTargetList(meaningfulArgs(stage), fallback);
}

function grepIntro(stage: ParsedCommandStage): string {
  const { pattern, paths } = grepPatternAndPaths(stage);
  const target = compactTargetList(paths.map((path) => path.target), shellIntroCopy.output);
  return `${shellIntroCopy.searchText} ${humanPattern(pattern)} in ${target}`;
}

function packageIntro(stage: ParsedCommandStage): string {
  const args = meaningfulArgs(stage);
  const script = args[0] === shellSyntaxTokens.run ? args[1] : args[0];
  if (script === undefined) return `${shellIntroCopy.packageCommand} with ${stage.command}`;
  return `${shellIntroCopy.runScript} ${script} with ${stage.command}`;
}

function runtimeIntro(stage: ParsedCommandStage): string {
  const inline = inlineCodeForRuntime(stage);
  if (inline !== null) return `${shellIntroCopy.runInlineCode} ${stage.command}`;
  return `${shellIntroCopy.run} ${stage.command} ${argText(stage, shellIntroCopy.command)}`;
}

function sedLineRange(stage: ParsedCommandStage): string | null {
  const script = meaningfulArgs(stage).find((arg) => /^\d+,\d+p$/.test(arg));
  if (script === undefined) return null;
  const range = script.replace(/p$/, "").replace(",", "-");
  return `${shellIntroCopy.showLines} ${range} from ${pathText(stage, shellIntroCopy.output)}`;
}

function urlText(stage: ParsedCommandStage): string {
  return meaningfulArgs(stage).find((arg) => /^[a-z][a-z0-9+.-]+:\/\//i.test(arg)) ?? argText(stage, shellIntroCopy.output);
}

function describeStageText(stage: ParsedCommandStage): string {
  if (packageManagers.has(stage.command)) return packageIntro(stage);
  if (runtimeCommands.has(stage.command)) return runtimeIntro(stage);
  if (archiveCreateCommands.has(stage.command)) return `${shellIntroCopy.createArchive} ${argText(stage, shellIntroCopy.archive)}`;
  switch (stage.command) {
    case "awk":
      return shellIntroCopy.extractOrReshape;
    case "cat":
      return `${shellIntroCopy.readFile} ${pathText(stage, shellIntroCopy.output)}`;
    case "cd":
      return `${shellIntroCopy.changeDirectory} ${argText(stage, shellIntroCopy.folders)}`;
    case "chmod":
      return `${shellIntroCopy.changePermissions} ${pathText(stage, argText(stage, shellIntroCopy.output))}`;
    case "chown":
      return `${shellIntroCopy.changeOwnership} ${pathText(stage, argText(stage, shellIntroCopy.output))}`;
    case "cp":
      return `${shellIntroCopy.copy} ${argText(stage, shellIntroCopy.output)}`;
    case "curl":
      return `${shellIntroCopy.fetchUrl} ${urlText(stage)}`;
    case "docker":
      return `${shellIntroCopy.inspectContainers} ${argText(stage, shellIntroCopy.command)}`;
    case "echo":
      return shellIntroCopy.printText;
    case "env":
      return `${shellIntroCopy.run} ${argText(stage, shellIntroCopy.command)}`;
    case "find":
      return `${shellIntroCopy.matchingPaths} ${pathText(stage, argText(stage, shellIntroCopy.folders))}`;
    case "git":
      return `${shellIntroCopy.repositoryCommand} ${argText(stage, shellIntroCopy.command)}`;
    case "grep":
    case "rg":
      return grepIntro(stage);
    case "head":
      return `${shellIntroCopy.showFirst} ${lineCount(stage.args, commandCopy.defaultLineCount)} lines from ${pathText(stage, shellIntroCopy.output)}`;
    case "jq":
      return shellIntroCopy.filterJson;
    case "ls": {
      const target = pathText(stage, argText(stage, shellIntroCopy.empty));
      return target.length === 0 ? shellIntroCopy.listFiles : `${shellIntroCopy.listFiles} ${shellIntroCopy.in} ${target}`;
    }
    case "mkdir":
      return `${shellIntroCopy.createFolder} ${argText(stage, shellIntroCopy.folders)}`;
    case "mv":
      return `${shellIntroCopy.moveOrRename} ${argText(stage, shellIntroCopy.output)}`;
    case "pgrep":
      return `${shellIntroCopy.findProcesses} ${humanPattern(quotedPayload(stage.args))}`;
    case "ping":
      return `${shellIntroCopy.checkNetwork} ${argText(stage, shellIntroCopy.command)}`;
    case "ps":
      return shellIntroCopy.listProcesses;
    case "pwd":
      return shellIntroCopy.printCurrentDirectory;
    case "rm":
      return `${shellIntroCopy.remove} ${pathText(stage, argText(stage, shellIntroCopy.output))}`;
    case "sed":
      return sedLineRange(stage) ?? `${shellIntroCopy.editOrFilter} ${pathText(stage, shellIntroCopy.output)}`;
    case "sort":
      return shellIntroCopy.sortLines;
    case "ss":
      return shellIntroCopy.inspectSockets;
    case "ssh":
      return `${shellIntroCopy.runSecureShell} ${argText(stage, shellIntroCopy.command)}`;
    case "tail":
      return `${shellIntroCopy.showLast} ${lineCount(stage.args, commandCopy.defaultLineCount)} lines from ${pathText(stage, shellIntroCopy.output)}`;
    case "tee":
      return `${shellIntroCopy.writeOutput} ${pathText(stage, argText(stage, shellIntroCopy.output))}`;
    case "timeout": {
      const duration = durationToken(stage.args);
      return duration === undefined
        ? `${shellIntroCopy.run} ${argText(stage, shellIntroCopy.command)}`
        : `${shellIntroCopy.run} ${argText(stage, shellIntroCopy.command)} for ${duration}`;
    }
    case "touch":
      return `${shellIntroCopy.createOrUpdate} ${pathText(stage, argText(stage, shellIntroCopy.output))}`;
    case "tr":
      return shellIntroCopy.translateCharacters;
    case "unzip":
      return `${shellIntroCopy.extractArchive} ${argText(stage, shellIntroCopy.archive)}`;
    case "wget":
      return `${shellIntroCopy.download} ${urlText(stage)}`;
    case "which":
      return `${shellIntroCopy.findExecutable} ${argText(stage, shellIntroCopy.command)}`;
    case "xargs":
      return shellIntroCopy.buildCommandsFromInput;
    default:
      return COMMAND_DICTIONARY[stage.command] !== undefined
        ? `${shellIntroCopy.run} ${stage.command} ${argText(stage, shellIntroCopy.command)}`
        : `${shellIntroCopy.unknownShellCommand} ${stage.command || argText(stage, shellIntroCopy.command)}`;
  }
}

export function describeShellCommand(command: string): string {
  const stages = parseCommand(command);
  const first = stages[0];
  if (first === undefined) return command;
  const intro = describeStageText(first);
  const remaining = stages.length - 1;
  if (remaining <= 0) return intro;
  return `${intro} ${shellIntroCopy.and} ${remaining} ${remaining === 1 ? shellIntroCopy.additionalStepsSingular : shellIntroCopy.additionalStepsPlural}`;
}

class CommandDescriptionBuilder {
  readonly prefix: string;
  readonly condition: string | null;
  readonly suffix: ReactNode;
  readonly start: string;

  constructor(readonly stage: ParsedCommandStage) {
    this.prefix = connectorPrefix(stage);
    this.condition = conditionText(stage);
    this.suffix = this.condition !== null ? <> ({this.condition}).</> : <>.</>;
    this.start = stage.connectorBefore === shellConnectors.pipe ? connectorPrefixes.start : this.prefix;
  }

  render(): ReactNode {
    return (
      COMMAND_DESCRIPTION_RENDERERS[this.stage.command] ?? renderGenericCommand
    )(this);
  }

  echo(): ReactNode {
    return (
      <>
        {this.prefix}print {codeValue(this.stage.args.join(" ") || commandCopy.noEchoPayload)} to
        the terminal{this.suffix}
      </>
    );
  }

  timeout(): ReactNode {
    const duration = durationToken(this.stage.args);
    const nested = this.stage.args.filter((arg) => arg !== duration);
    const nestedName =
      nested.length > 0 ? commandNameForTokens(nested).toLowerCase() : undefined;
    return (
      <>
        {this.prefix}run{" "}
        {nestedName !== undefined ? (
          <CommandChip command={nestedName} compact />
        ) : (
          commandCopy.fallbackCommand
        )}
        {duration !== undefined ? (
          <> with a {codeValue(duration)} time limit</>
        ) : (
          " with a time limit"
        )}
        {this.suffix}
      </>
    );
  }

  grep(): ReactNode {
    const { pattern, paths } = grepPatternAndPaths(this.stage);
    return (
      <>
        {this.start}
        {this.stage.connectorBefore === shellConnectors.pipe
          ? commandCopy.grepPipedOutput
          : commandCopy.grepText}{" "}
        for {codeValue(humanPattern(pattern))}
        {paths.length > 0 ? <> within <PathChipList paths={paths} /></> : null}
        {this.suffix}
      </>
    );
  }

  head(): ReactNode {
    return this.lineWindow(lineWindowPositions.first);
  }

  tail(): ReactNode {
    return this.lineWindow(lineWindowPositions.last);
  }

  awk(): ReactNode {
    return (
      <>
        {this.prefix}extract or reshape fields with{" "}
        {codeValue(quotedPayload(this.stage.args) ?? commandCopy.awkProgram)}
        {this.suffix}
      </>
    );
  }

  sort(): ReactNode {
    return (
      <>
        {this.prefix}sort the lines
        {this.stage.flags.includes(shellFlags.uniqueSort) ? " and remove duplicates" : ""}
        {this.suffix}
      </>
    );
  }

  tr(): ReactNode {
    return (
      <>
        {this.prefix}translate{" "}
        {codeValue(unquote(this.stage.args[0] ?? commandCopy.trSource))} into{" "}
        {codeValue(unquote(this.stage.args[1] ?? commandCopy.trTarget))}
        {this.suffix}
      </>
    );
  }

  ss(): ReactNode {
    return <>{this.prefix}inspect sockets and connections{this.suffix}</>;
  }

  pgrep(): ReactNode {
    return (
      <>
        {this.prefix}find running processes matching{" "}
        {codeValue(humanPattern(quotedPayload(this.stage.args)))}
        {this.suffix}
      </>
    );
  }

  ls(): ReactNode {
    return (
      <>
        {this.prefix}list{" "}
        {this.stage.paths.length > 0 ? (
          <PathChipList paths={this.stage.paths} />
        ) : (
          commandCopy.filesOrDirectories
        )}
        {this.suffix}
      </>
    );
  }

  runtime(): ReactNode {
    const inline = inlineCodeForRuntime(this.stage);
    if (inline !== null) return this.inlineRuntime(inline);
    return (
      <>
        {this.prefix}run {this.stage.command === commandNames.node ? runtimeLanguageLabels.nodeJs : runtimeLanguageLabels.python}
        {this.stage.paths.length > 0 ? (
          <> with <PathChipList paths={this.stage.paths} /></>
        ) : null}
        {this.suffix}
      </>
    );
  }

  cat(): ReactNode {
    return (
      <>
        {this.prefix}print <PathChipList paths={this.stage.paths} /> contents
        {this.suffix}
      </>
    );
  }

  find(): ReactNode {
    return (
      <>
        {this.prefix}walk{" "}
        {this.stage.paths.length > 0 ? (
          <PathChipList paths={this.stage.paths} />
        ) : (
          commandCopy.folders
        )}{" "}
        and match paths{this.suffix}
      </>
    );
  }

  generic(): ReactNode {
    const intro = describeStageText(this.stage);
    return (
      <>
        {this.prefix}
        {this.prefix.length > 0 ? lowerInitial(intro) : intro}
        {this.suffix}
      </>
    );
  }

  private lineWindow(position: "first" | "last"): ReactNode {
    return (
      <>
        {this.prefix}show the {position}{" "}
        {codeValue(lineCount(this.stage.args, commandCopy.defaultLineCount))} lines
        {this.stage.paths.length > 0 ? (
          <> from <PathChipList paths={this.stage.paths} /></>
        ) : null}
        {this.suffix}
      </>
    );
  }

  private inlineRuntime(inline: { label: string; code: string }): ReactNode {
    return (
      <>
        {this.prefix}run inline{" "}
        {this.stage.command === commandNames.node ? runtimeLanguageLabels.javaScript : runtimeLanguageLabels.python} code
        {this.suffix}
        <CodeBlock label={inline.label}>{inline.code}</CodeBlock>
      </>
    );
  }
}

type CommandDescriptionRenderer = (
  builder: CommandDescriptionBuilder,
) => ReactNode;

const renderGenericCommand: CommandDescriptionRenderer = (builder) =>
  builder.generic();

const COMMAND_DESCRIPTION_RENDERERS: Record<string, CommandDescriptionRenderer> =
  {
    awk: (builder) => builder.awk(),
    cat: (builder) => builder.cat(),
    echo: (builder) => builder.echo(),
    find: (builder) => builder.find(),
    grep: (builder) => builder.grep(),
    head: (builder) => builder.head(),
    ls: (builder) => builder.ls(),
    node: (builder) => builder.runtime(),
    pgrep: (builder) => builder.pgrep(),
    python: (builder) => builder.runtime(),
    python3: (builder) => builder.runtime(),
    rg: (builder) => builder.grep(),
    sort: (builder) => builder.sort(),
    ss: (builder) => builder.ss(),
    tail: (builder) => builder.tail(),
    timeout: (builder) => builder.timeout(),
    tr: (builder) => builder.tr(),
  };

function commandDescription(stage: ParsedCommandStage): ReactNode {
  return new CommandDescriptionBuilder(stage).render();
}

function stageHasOutput(stage: ParsedCommandStage, index: number, stages: ParsedCommandStage[]): boolean {
  return index < stages.length - 1 && stages[index + 1]?.connectorBefore === shellConnectors.pipe;
}

function accessItemsForCommand(command: string, input?: unknown): AccessItem[] {
  const items = new Map<string, AccessItem>();
  for (const stage of parseCommand(command)) {
    for (const item of stage.paths) {
      items.set(item.target, item);
    }
  }
  const inputPath = stringFromInput(input, ["file_path", "filePath", "path", "absPath", "absolute_path"]);
  if (inputPath !== undefined && !items.has(inputPath)) {
    items.set(inputPath, { target: inputPath, access: accessKinds.reference });
  }
  return [...items.values()];
}

export function CommandPresentation({
  command,
}: {
  command: string;
  input?: unknown;
}): JSX.Element {
  const stages = parseCommand(command);
  return (
    <div className="tool-command-card">
      <div className="tool-command-chipbar" aria-label="Command pipeline">
        {stages.map((stage, index) => (
          <span className="tool-command-flow-node" key={`${stage.raw}-${index}`}>
            {index > 0 ? <span className="tool-command-flow-join" aria-hidden="true" /> : null}
            <CommandChip command={stage.command} />
          </span>
        ))}
      </div>
      <pre className="tool-command-code" aria-label="Shell command">
        {command}
      </pre>
      <ol className="tool-command-story" aria-label="Command steps">
        {stages.map((stage, index) => (
          <li key={`${stage.raw}-story-${index}`}>
            <CommandChip command={stage.command} compact />
            <div className="tool-command-story-text">{commandDescription(stage)}</div>
            {stageHasOutput(stage, index, stages) ? (
              <span className="tool-command-output-note">Feeds output forward</span>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
