import type { JSX, ReactNode } from "react";
import type { AccessRequestPayload, ToolUsePayload } from "@f-mark/shared";
import {
  CodeBlock,
  CodeExcerpt,
  ErrorNotice,
  RawDetails,
  ToolDiff,
  ToolFileReference,
  ToolMeta,
  firstNumber,
  firstString,
  isRecord,
  parseJsonString,
  stringifyForDisplay,
  type FileReference,
  type MetaItem,
  type StructuredError,
} from "./ToolPresentationParts.js";
import {
  CommandPresentation,
  describeShellCommand,
  splitCommandAndReason,
} from "./CommandPresentation.js";

export interface PresentationSection {
  title: string;
  content: ReactNode;
}

export interface ToolPresentation {
  title: string;
  titleDetail?: string;
  status?: string;
  compactInternal?: boolean;
  intro?: string;
  summary?: string;
  sections: PresentationSection[];
  raw?: unknown;
}

const fmarkToolPrefixes = {
  mcp: "mcp__fmark__",
  selection: "select:mcp__fmark__",
} as const;

const normalizedToolKinds = {
  toolSearch: "toolsearch",
  bash: "bash",
  shell: "shell",
  terminal: "terminal",
  read: "read",
  view: "view",
  openFile: "openfile",
  edit: "edit",
  multiEdit: "multiedit",
  write: "write",
  createFile: "createfile",
  grep: "grep",
  glob: "glob",
  search: "search",
  ls: "ls",
  webFetch: "webfetch",
  webSearch: "websearch",
  fetch: "fetch",
} as const;

const resultStateLabels = {
  yes: "yes",
  noneExpected: "none expected",
  waitingForResult: "waiting for result",
  runtimeFallback: "runtime",
} as const;

const toolIntroCopy = {
  editFile: "Edit file",
  fallbackTarget: "request",
  fetch: "Fetch",
  readFile: "Read file",
  search: "Search for",
  writeFile: "Write file",
} as const;

function lowerToolName(name: string | undefined): string {
  return (name ?? "").toLowerCase();
}

function normalizedToolKind(name: string | undefined): string {
  return lowerToolName(name).replace(/[^a-z0-9]/g, "");
}

function isFmarkMcpTool(name: string | undefined): boolean {
  return lowerToolName(name).startsWith(fmarkToolPrefixes.mcp);
}

function isFmarkToolSelection(toolName: string | undefined, input: unknown): boolean {
  if (normalizedToolKind(toolName) !== normalizedToolKinds.toolSearch) return false;
  if (!isRecord(input)) return false;
  const query = firstString(input, ["query", "q"]);
  return query?.startsWith(fmarkToolPrefixes.selection) === true;
}

function filePathFrom(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  const direct = firstString(value, [
    "file_path",
    "filePath",
    "path",
    "absPath",
    "absolute_path",
  ]);
  if (direct !== undefined) return direct;
  const file = value.file;
  if (isRecord(file)) {
    return firstString(file, ["file_path", "filePath", "path", "absPath"]);
  }
  return undefined;
}

function fileNameFromPath(path: string | undefined): string | undefined {
  if (path === undefined) return undefined;
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts.at(-1) ?? path;
}

function contentFrom(value: unknown): string | undefined {
  const parsed = parseJsonString(value);
  if (typeof parsed === "string") return parsed;
  if (!isRecord(parsed)) return undefined;
  const direct = firstString(parsed, [
    "content",
    "text",
    "stdout",
    "output",
    "result",
    "snippet",
  ]);
  if (direct !== undefined) return direct;
  const file = parsed.file;
  if (isRecord(file)) return firstString(file, ["content", "text"]);
  return undefined;
}

function metaFrom(record: Record<string, unknown>, keys: string[]): MetaItem[] {
  const items: MetaItem[] = [];
  for (const key of keys) {
    const value = record[key];
    if (value === undefined || value === null || value === "") continue;
    items.push({ label: key.replace(/_/g, " "), value: String(value) });
  }
  return items;
}

function jsonPreview(value: unknown, max = 320): string {
  const text = stringifyForDisplay(value);
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function compactPathLabel(path: string | undefined): string | undefined {
  return fileNameFromPath(path) ?? path;
}

function toolIntroWithPath(action: string, path: string | undefined, fallback: string): string {
  return `${action} ${compactPathLabel(path) ?? fallback}`;
}

function readIntro(input: unknown, result: unknown, fallback: string): string {
  const path = filePathFrom(isRecord(input) ? input : {}) ?? filePathFrom(result);
  return toolIntroWithPath(toolIntroCopy.readFile, path, fallback);
}

function editIntro(input: unknown, result: unknown, fallback: string): string {
  const path = filePathFrom(isRecord(input) ? input : {}) ?? filePathFrom(result);
  return toolIntroWithPath(toolIntroCopy.editFile, path, fallback);
}

function writeIntro(input: unknown, result: unknown, fallback: string): string {
  const path = filePathFrom(isRecord(input) ? input : {}) ?? filePathFrom(result);
  return toolIntroWithPath(toolIntroCopy.writeFile, path, fallback);
}

function searchIntro(input: unknown, fallback: string): string {
  if (!isRecord(input)) return `${toolIntroCopy.search} ${fallback}`;
  const pattern = firstString(input, ["pattern", "query", "glob", "include"]);
  const path = firstString(input, ["path", "file_path", "filePath"]);
  if (pattern !== undefined && path !== undefined) {
    return `${toolIntroCopy.search} ${pattern} in ${compactPathLabel(path) ?? path}`;
  }
  if (pattern !== undefined) return `${toolIntroCopy.search} ${pattern}`;
  return `${toolIntroCopy.search} ${fallback}`;
}

function webIntro(input: unknown, fallback: string): string {
  if (!isRecord(input)) return `${toolIntroCopy.fetch} ${fallback}`;
  const target = firstString(input, ["url", "query", "prompt"]);
  return `${toolIntroCopy.fetch} ${target ?? fallback}`;
}

function commandTitle(input: unknown, fallback: string): {
  title: string;
  titleDetail?: string;
} {
  const rec = isRecord(input) ? input : {};
  const command = firstString(rec, ["command", "cmd", "script"]);
  if (command === undefined) return { title: fallback };
  const normalized = command.trim().replace(/\s+/g, " ");
  const match = /^(\S+)(?:\s+(.+))?$/.exec(normalized);
  if (match === null) return { title: fallback };
  const commandToken = match[1];
  if (commandToken === undefined) return { title: fallback };
  const commandName = fileNameFromPath(commandToken) ?? commandToken;
  const detail = match[2];
  return detail === undefined
    ? { title: commandName }
    : { title: commandName, titleDetail: detail };
}

function errorFromToolResult(
  success: boolean,
  result: unknown,
): StructuredError | null {
  if (success) return null;
  const parsed = parseJsonString(result);
  if (isRecord(parsed)) {
    const stderr = firstString(parsed, ["stderr", "error", "message"]);
    const code = parsed.exit_code ?? parsed.exitCode ?? parsed.code;
    return {
      title: code !== undefined ? `Tool failed (${String(code)})` : "Tool failed",
      message: stderr ?? "The provider reported this tool call as failed.",
      details: parsed,
    };
  }
  return {
    title: "Tool failed",
    message:
      typeof parsed === "string" && parsed.trim().length > 0
        ? parsed
        : "The provider reported this tool call as failed.",
    details: parsed,
  };
}

function bashSections(
  input: unknown,
  result: unknown,
  success: boolean,
): PresentationSection[] {
  const inRec = isRecord(input) ? input : {};
  const parsedResult = parseJsonString(result);
  const outRec = isRecord(parsedResult) ? parsedResult : {};
  const sections: PresentationSection[] = [];
  const description = firstString(inRec, ["description"]);
  const command = firstString(inRec, ["command", "cmd", "script"]);
  const cwd = firstString(inRec, ["cwd", "working_directory"]);
  const meta = metaFrom(inRec, ["timeout", "run_in_background"]);

  if (description !== undefined) {
    sections.push({ title: "Description", content: <p>{description}</p> });
  }
  if (command !== undefined) {
    sections.push({
      title: "Command",
      content: <CommandPresentation command={command} input={input} />,
    });
  }
  sections.push({
    title: "Parameters",
    content: <ToolMeta items={[{ label: "cwd", value: cwd }, ...meta]} />,
  });

  const error = errorFromToolResult(success, parsedResult);
  if (error !== null) {
    sections.push({ title: "Status", content: <ErrorNotice error={error} /> });
  }

  const stdout = firstString(outRec, ["stdout", "output"]);
  const stderr = firstString(outRec, ["stderr"]);
  const noOutput = outRec.noOutputExpected === true || outRec.no_output_expected === true;
  const interrupted = outRec.interrupted === true;
  if (stdout !== undefined && stdout.length > 0) {
    sections.push({ title: "stdout", content: <CodeBlock>{stdout}</CodeBlock> });
  }
  if (stderr !== undefined && stderr.length > 0) {
    sections.push({ title: "stderr", content: <CodeBlock>{stderr}</CodeBlock> });
  }
  if (interrupted || noOutput || result === undefined) {
    sections.push({
      title: "Result",
      content: (
        <ToolMeta
          items={[
            {
              label: "interrupted",
              value: interrupted ? resultStateLabels.yes : undefined,
            },
            {
              label: "output",
              value: noOutput ? resultStateLabels.noneExpected : undefined,
            },
            {
              label: "state",
              value:
                result === undefined
                  ? resultStateLabels.waitingForResult
                  : undefined,
            },
          ]}
        />
      ),
    });
  }
  if (
    result !== undefined &&
    stdout === undefined &&
    stderr === undefined &&
    typeof parsedResult === "string" &&
    parsedResult.trim().length > 0
  ) {
    sections.push({ title: "Output", content: <CodeBlock>{parsedResult}</CodeBlock> });
  }
  return sections.filter((section) => section.content !== null);
}

function readSections(input: unknown, result: unknown): PresentationSection[] {
  const inRec = isRecord(input) ? input : {};
  const parsedResult = parseJsonString(result);
  const path = filePathFrom(inRec) ?? filePathFrom(parsedResult);
  const startLine =
    firstNumber(inRec, ["start_line", "startLine", "offset"]) ??
    firstNumber(isRecord(parsedResult) ? parsedResult : {}, ["start_line", "startLine"]) ??
    1;
  const sections: PresentationSection[] = [];
  if (path !== undefined) {
    sections.push({
      title: "File",
      content: <ToolFileReference file={{ path, line: startLine }} />,
    });
  }
  sections.push({
    title: "Parameters",
    content: (
      <ToolMeta
        items={metaFrom(inRec, [
          "limit",
          "offset",
          "start_line",
          "end_line",
          "startLine",
          "endLine",
        ])}
      />
    ),
  });
  const content = contentFrom(parsedResult);
  if (content !== undefined) {
    sections.push({
      title: "Excerpt",
      content: <CodeExcerpt content={content} startLine={startLine} />,
    });
  }
  return sections;
}

function editSections(input: unknown, result: unknown): PresentationSection[] {
  const inRec = isRecord(input) ? input : {};
  const parsedResult = parseJsonString(result);
  const outRec = isRecord(parsedResult) ? parsedResult : {};
  const path = filePathFrom(inRec) ?? filePathFrom(outRec);
  const sections: PresentationSection[] = [];
  if (path !== undefined) {
    sections.push({ title: "File", content: <ToolFileReference file={{ path }} /> });
  }
  sections.push({
    title: "Parameters",
    content: (
      <ToolMeta
        items={[
          ...metaFrom(inRec, ["replace_all", "replaceAll"]),
          ...metaFrom(outRec, ["success", "changed", "line", "start_line", "end_line"]),
        ]}
      />
    ),
  });

  const edits = Array.isArray(inRec.edits) ? inRec.edits : undefined;
  if (edits !== undefined) {
    sections.push({
      title: "Diff",
      content: (
        <div className="diff-stack">
          {edits.map((edit, index) => {
            const rec = isRecord(edit) ? edit : {};
            const oldText = firstString(rec, ["old_string", "oldString", "old"]) ?? "";
            const newText = firstString(rec, ["new_string", "newString", "new"]) ?? "";
            return (
              <ToolDiff
                key={`edit-${index}`}
                title={`Edit ${index + 1}`}
                oldText={oldText}
                newText={newText}
              />
            );
          })}
        </div>
      ),
    });
    return sections;
  }

  const oldText =
    firstString(inRec, ["old_string", "oldString", "old"]) ??
    firstString(outRec, ["oldString", "old_string"]);
  const newText =
    firstString(inRec, ["new_string", "newString", "new"]) ??
    firstString(outRec, ["newString", "new_string"]);
  if (oldText !== undefined || newText !== undefined) {
    sections.push({
      title: "Diff",
      content: <ToolDiff oldText={oldText ?? ""} newText={newText ?? ""} />,
    });
  }
  return sections;
}

function writeSections(input: unknown, result: unknown): PresentationSection[] {
  const sections = readSections(input, result);
  const content = contentFrom(input);
  if (content !== undefined) {
    sections.push({ title: "Written content", content: <CodeExcerpt content={content} /> });
  }
  return sections;
}

function fileHits(value: unknown): FileReference[] {
  const parsed = parseJsonString(value);
  const candidates = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed) && Array.isArray(parsed.matches)
      ? parsed.matches
      : isRecord(parsed) && Array.isArray(parsed.files)
        ? parsed.files
        : isRecord(parsed) && Array.isArray(parsed.results)
          ? parsed.results
          : [];
  return candidates
    .map((item): FileReference | null => {
      if (typeof item === "string") return { path: item };
      if (!isRecord(item)) return null;
      const path = filePathFrom(item);
      if (path === undefined) return null;
      const line = firstNumber(item, ["line", "line_number", "lineNumber"]);
      return { path, line };
    })
    .filter((item): item is FileReference => item !== null)
    .slice(0, 20);
}

function searchSections(input: unknown, result: unknown): PresentationSection[] {
  const inRec = isRecord(input) ? input : {};
  const sections: PresentationSection[] = [
    {
      title: "Search",
      content: (
        <ToolMeta
          items={metaFrom(inRec, [
            "pattern",
            "query",
            "glob",
            "path",
            "include",
            "limit",
            "max_results",
          ])}
        />
      ),
    },
  ];
  const hits = fileHits(result);
  if (hits.length > 0) {
    sections.push({
      title: "Files",
      content: (
        <div className="tool-file-list">
          {hits.map((file, index) => (
            <ToolFileReference key={`${file.path}-${file.line ?? index}`} file={file} />
          ))}
        </div>
      ),
    });
  } else if (result !== undefined) {
    sections.push({ title: "Result", content: <CodeBlock>{jsonPreview(result)}</CodeBlock> });
  }
  return sections;
}

function webSections(input: unknown, result: unknown): PresentationSection[] {
  const inRec = isRecord(input) ? input : {};
  return [
    {
      title: "Request",
      content: <ToolMeta items={metaFrom(inRec, ["url", "query", "prompt"])} />,
    },
    ...(result !== undefined
      ? [{ title: "Result", content: <CodeBlock>{jsonPreview(result, 1000)}</CodeBlock> }]
      : []),
  ];
}

function fmarkPreviewSections(input: unknown): PresentationSection[] {
  const rec = isRecord(input) ? input : {};
  const content = firstString(rec, ["content", "body", "message", "markdown", "html"]);
  const title = firstString(rec, ["title", "question", "name"]);
  const path = filePathFrom(rec);
  const sections: PresentationSection[] = [];
  if (title !== undefined) sections.push({ title: "Title", content: <p>{title}</p> });
  if (content !== undefined) {
    sections.push({ title: "Preview", content: <CodeBlock>{content}</CodeBlock> });
  }
  if (path !== undefined) {
    sections.push({ title: "File", content: <ToolFileReference file={{ path }} /> });
  }
  if (sections.length === 0) {
    sections.push({ title: "Request", content: <CodeBlock>{jsonPreview(input)}</CodeBlock> });
  }
  return sections;
}

export function presentToolUse(payload: ToolUsePayload): ToolPresentation | null {
  const input = parseJsonString(payload.input);
  const result = parseJsonString(payload.result);
  const toolName = payload.tool_name;
  const kind = normalizedToolKind(toolName);

  if (isFmarkMcpTool(toolName)) {
    return {
      title: "F-Mark internal tool",
      compactInternal: true,
      summary: toolName.replace(/^mcp__fmark__/, ""),
      sections: fmarkPreviewSections(input),
      raw: { input: payload.input, result: payload.result },
    };
  }

  if (isFmarkToolSelection(toolName, input)) {
    return {
      title: "F-Mark tool selection",
      compactInternal: true,
      summary: "Internal MCP tool lookup",
      sections: [],
      raw: { input: payload.input, result: payload.result },
    };
  }

  if (
    kind === normalizedToolKinds.bash ||
    kind === normalizedToolKinds.shell ||
    kind === normalizedToolKinds.terminal
  ) {
    const title = commandTitle(input, toolName);
    const command = firstString(isRecord(input) ? input : {}, ["command", "cmd", "script"]);
    return {
      ...title,
      intro: command !== undefined ? describeShellCommand(command) : undefined,
      sections: bashSections(input, result, payload.success),
      raw: { input: payload.input, result: payload.result },
    };
  }
  if (
    kind === normalizedToolKinds.read ||
    kind === normalizedToolKinds.view ||
    kind === normalizedToolKinds.openFile
  ) {
    const path = filePathFrom(isRecord(input) ? input : {}) ?? filePathFrom(result);
    return {
      title: fileNameFromPath(path) ?? toolName,
      intro: readIntro(input, result, toolName),
      sections: readSections(input, result),
      raw: { input: payload.input, result: payload.result },
    };
  }
  if (
    kind === normalizedToolKinds.edit ||
    kind === normalizedToolKinds.multiEdit
  ) {
    return {
      title: toolName,
      intro: editIntro(input, result, toolName),
      sections: editSections(input, result),
      raw: { input: payload.input, result: payload.result },
    };
  }
  if (
    kind === normalizedToolKinds.write ||
    kind === normalizedToolKinds.createFile
  ) {
    return {
      title: toolName,
      intro: writeIntro(input, result, toolName),
      sections: writeSections(input, result),
      raw: { input: payload.input, result: payload.result },
    };
  }
  if (
    kind === normalizedToolKinds.grep ||
    kind === normalizedToolKinds.glob ||
    kind === normalizedToolKinds.search ||
    kind === normalizedToolKinds.toolSearch ||
    kind === normalizedToolKinds.ls
  ) {
    return {
      title: toolName,
      intro: searchIntro(input, toolName),
      sections: searchSections(input, result),
      raw: { input: payload.input, result: payload.result },
    };
  }
  if (
    kind === normalizedToolKinds.webFetch ||
    kind === normalizedToolKinds.webSearch ||
    kind === normalizedToolKinds.fetch
  ) {
    return {
      title: toolName,
      intro: webIntro(input, toolName),
      sections: webSections(input, result),
      raw: { input: payload.input, result: payload.result },
    };
  }

  return {
    title: toolName,
    sections: [
      { title: "input", content: <CodeBlock>{stringifyForDisplay(input)}</CodeBlock> },
      ...(payload.result !== undefined
        ? [{ title: "result", content: <CodeBlock>{stringifyForDisplay(result)}</CodeBlock> }]
        : []),
    ],
  };
}

function requestInput(request: AccessRequestPayload): unknown {
  if (request.tool_input !== undefined) return parseJsonString(request.tool_input);
  if (isRecord(request.raw)) {
    const rawInput =
      request.raw.tool_input ??
      request.raw.toolInput ??
      request.raw.input ??
      request.raw.parameters;
    if (rawInput !== undefined) return parseJsonString(rawInput);
  }
  return undefined;
}

export function presentAccessRequest(
  request: AccessRequestPayload,
): ToolPresentation {
  const input = requestInput(request);
  const toolName = request.tool_name ?? request.title;
  const kind = normalizedToolKind(toolName);
  const sections: PresentationSection[] = [];

  if (
    request.command !== undefined ||
    kind === normalizedToolKinds.bash ||
    kind === normalizedToolKinds.shell
  ) {
    const inRec = isRecord(input) ? input : {};
    const rawCommand = request.command ?? firstString(inRec, ["command", "cmd"]);
    const explicitReason = firstString(inRec, [
      "description",
      "reason",
      "rationale",
      "purpose",
      "summary",
    ]);
    const commandInfo =
      rawCommand !== undefined
        ? splitCommandAndReason(rawCommand, explicitReason)
        : undefined;
    if (commandInfo?.reason !== undefined) {
      sections.push({ title: "Reason", content: <p>{commandInfo.reason}</p> });
    }
    if (commandInfo !== undefined) {
      sections.push({
        title: "Command",
        content: <CommandPresentation command={commandInfo.command} input={input} />,
      });
    }
  } else if (
    kind === normalizedToolKinds.edit ||
    kind === normalizedToolKinds.multiEdit
  ) {
    sections.push(...editSections(input, undefined));
  } else if (isFmarkMcpTool(request.tool_name)) {
    sections.push(...fmarkPreviewSections(input));
  } else if (request.message !== undefined) {
    sections.push({ title: "Request", content: <p>{request.message}</p> });
  } else if (input !== undefined) {
    sections.push({
      title: "Request",
      content: <CodeBlock>{jsonPreview(input, 1000)}</CodeBlock>,
    });
  }

  sections.push({
    title: "Metadata",
    content: (
      <ToolMeta
        items={[
          {
            label: "runtime",
            value: request.runtime_id ?? resultStateLabels.runtimeFallback,
          },
          { label: "channel", value: request.response_channel },
          { label: "mode", value: request.permission_mode },
          { label: "cwd", value: request.cwd },
          { label: "type", value: request.request_type },
        ]}
      />
    ),
  });

  return {
    title: request.title,
    summary: request.message,
    sections,
    raw: { tool_input: request.tool_input, raw: request.raw },
  };
}

export function renderPresentationSections(
  sections: PresentationSection[],
): JSX.Element[] {
  return sections
    .filter((section) => section.content !== null)
    .map((section) => (
      <section className="io" key={section.title}>
        <h4 className="io-label">{section.title}</h4>
        {section.content}
      </section>
    ));
}

export function renderRawDetails(value: unknown): JSX.Element {
  return <RawDetails value={value} />;
}
