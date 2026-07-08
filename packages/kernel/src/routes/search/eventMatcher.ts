import type {
  AnyEventRecord,
  ChoicesPayload,
  FileRefPayload,
  FlowPayload,
  HtmlManifest,
  ProsePayload,
  SubagentOutputPayload,
  SubagentRunPayload,
  TodoPayload,
  ToolUsePayload,
} from "@f-mark/shared";

const SNIPPET_RADIUS = 60; // ~120 char window

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function buildSnippet(text: string, queryLower: string): string {
  const lower = text.toLowerCase();
  const idx = lower.indexOf(queryLower);
  if (idx === -1) {
    return text.length > SNIPPET_RADIUS * 2
      ? `${text.slice(0, SNIPPET_RADIUS * 2)}…`
      : text;
  }
  const start = Math.max(0, idx - SNIPPET_RADIUS);
  const end = Math.min(text.length, idx + queryLower.length + SNIPPET_RADIUS);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  return `${prefix}${text.slice(start, end)}${suffix}`;
}

export class SearchEventMatcher {
  private readonly handlers: Record<string, (payload: unknown) => string | null> =
    {
      prose: (payload) => this.matchProse(payload as ProsePayload),
      choices: (payload) => this.matchChoices(payload as ChoicesPayload),
      todo: (payload) =>
        this.firstMatchingText(
          (payload as TodoPayload).title,
          (payload as TodoPayload).body,
        ),
      file: (payload) =>
        this.matchJoined(
          (payload as FileRefPayload).display_name,
          (payload as FileRefPayload).path,
          (payload as FileRefPayload).mime_type,
          (payload as FileRefPayload).description,
        ),
      html: (payload) => this.matchHtml(payload as HtmlManifest),
      flow: (payload) => this.matchFlow(payload as FlowPayload),
      "tool-use": (payload) => this.matchToolUse(payload as ToolUsePayload),
      "subagent-run": (payload) =>
        this.matchSubagentRun(payload as SubagentRunPayload),
      "subagent-output": (payload) =>
        this.matchSubagentOutput(payload as SubagentOutputPayload),
    };

  constructor(private readonly queryLower: string) {}

  match(event: AnyEventRecord): string | null {
    const handler = this.handlers[event.kind];
    return handler === undefined
      ? this.matchText(JSON.stringify(event.payload))
      : handler(event.payload);
  }

  private matchProse(payload: ProsePayload): string | null {
    return this.firstMatchingText(payload.name, payload.content);
  }

  private matchChoices(payload: ChoicesPayload): string | null {
    const question = this.matchText(payload.question);
    if (question !== null) return question;
    for (const option of payload.options ?? []) {
      const label = this.matchText(option.label);
      if (label !== null) return label;
    }
    return null;
  }

  private matchHtml(payload: HtmlManifest): string | null {
    return this.matchJoined(
      payload.title,
      payload.id,
      ...(payload.dependencies ?? []),
    );
  }

  private matchFlow(payload: FlowPayload): string | null {
    const nodeText = payload.nodes
      .map((node) => [node.label, node.title, node.content].join(" "))
      .join(" ");
    const edgeText = payload.edges.map((edge) => edge.label ?? "").join(" ");
    return this.matchJoined(payload.title, payload.id, nodeText, edgeText);
  }

  private matchToolUse(payload: ToolUsePayload): string | null {
    return this.matchJoined(
      payload.tool_name,
      payload.tool_use_id,
      JSON.stringify(payload.input),
      JSON.stringify(payload.result),
    );
  }

  private matchSubagentRun(payload: SubagentRunPayload): string | null {
    return this.matchJoined(
      payload.name,
      payload.role,
      payload.prompt_preview,
      payload.status,
      payload.subagent_id,
      payload.correlation_id,
      payload.source,
    );
  }

  private matchSubagentOutput(payload: SubagentOutputPayload): string | null {
    return this.matchJoined(
      payload.name,
      payload.content,
      payload.status,
      payload.subagent_id,
      payload.correlation_id,
      payload.source,
    );
  }

  private firstMatchingText(...values: unknown[]): string | null {
    for (const value of values) {
      const match = this.matchText(value);
      if (match !== null) return match;
    }
    return null;
  }

  private matchJoined(...values: unknown[]): string | null {
    return this.matchText(values.filter(isNonEmptyString).join(" "));
  }

  private matchText(value: unknown): string | null {
    if (!isNonEmptyString(value)) return null;
    return value.toLowerCase().includes(this.queryLower)
      ? buildSnippet(value, this.queryLower)
      : null;
  }
}
