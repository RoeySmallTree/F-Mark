import {
  EVENT_KINDS,
  type AnyEventRecord,
  type EventKind,
  type ProsePayload,
} from "@f-mark/shared";

const summaryFallbacks = {
  empty: "(empty)",
  question: "<question>",
  none: "(none)",
  open: "open",
  untitled: "(untitled)",
  html: "html",
  file: "file",
  accessRequest: "access request",
  response: "response",
  subAgent: "sub-agent",
  unknown: "unknown",
  output: "output",
  session: "session",
  turnEnded: "turn ended",
} as const;

const forkDirections = {
  from: "from",
} as const;

const forkLabels = {
  from: "Forked from",
  to: "Forked to",
} as const;

class EventSummaryBuilder {
  constructor(private readonly event: AnyEventRecord) {}

  summary(): string {
    return (SUMMARY_RENDERERS[this.event.kind] ?? renderKindSummary)(this);
  }

  prose(): string {
    const payload = this.event.payload as ProsePayload;
    if (typeof payload.name === "string" && payload.name.length > 0) {
      return `“${payload.name}”`;
    }
    return this.normalizedText(payload.content, summaryFallbacks.empty);
  }

  choices(): string {
    const payload = this.event.payload as { question?: string };
    const question = this.normalizedText(payload.question, "");
    return question.length > 0 ? `“${question}”` : summaryFallbacks.question;
  }

  choice(): string {
    const payload = this.event.payload as { selected?: string[] };
    return `chose ${(payload.selected ?? []).join(", ") || summaryFallbacks.none}`;
  }

  todo(): string {
    const payload = this.event.payload as { title?: string; status?: string };
    const title = (payload.title ?? "").trim();
    return `[${payload.status ?? summaryFallbacks.open}] ${title || summaryFallbacks.untitled}`;
  }

  html(): string {
    const payload = this.event.payload as { title?: string; id?: string };
    return `“${payload.title ?? payload.id ?? summaryFallbacks.html}”`;
  }

  file(): string {
    const payload = this.event.payload as {
      path?: string;
      description?: string;
      display_name?: string;
    };
    return (
      payload.description ??
      payload.display_name ??
      payload.path ??
      summaryFallbacks.file
    );
  }

  accessRequest(): string {
    const payload = this.event.payload as {
      title?: string;
      command?: string;
      message?: string;
    };
    return (
      payload.command ??
      payload.message ??
      payload.title ??
      summaryFallbacks.accessRequest
    );
  }

  accessResponse(): string {
    const payload = this.event.payload as { status?: string; decision?: string };
    return `${payload.status ?? payload.decision ?? summaryFallbacks.response}`;
  }

  subagentRun(): string {
    const payload = this.event.payload as {
      name?: string;
      status?: string;
      source?: string;
    };
    return `${payload.name ?? summaryFallbacks.subAgent} ${payload.status ?? ""} (${payload.source ?? summaryFallbacks.unknown})`;
  }

  subagentOutput(): string {
    const payload = this.event.payload as { name?: string; content?: string };
    const text = this.normalizedText(payload.content, "");
    const head = payload.name ?? summaryFallbacks.subAgent;
    return text.length > 0 ? `${head}: ${text}` : `${head}: ${summaryFallbacks.output}`;
  }

  forkLink(): string {
    const payload = this.event.payload as {
      direction?: "from" | "to";
      other_session_slug?: string;
    };
    const verb =
      payload.direction === forkDirections.from ? forkLabels.from : forkLabels.to;
    return `${verb} ${payload.other_session_slug ?? summaryFallbacks.session}`;
  }

  kind(): string {
    return this.event.kind;
  }

  private normalizedText(
    value: string | undefined,
    fallback: string,
  ): string {
    const text = (value ?? "").replace(/\s+/g, " ").trim();
    return text.length > 0 ? text : fallback;
  }
}

type SummaryRenderer = (builder: EventSummaryBuilder) => string;

const renderKindSummary: SummaryRenderer = (builder) => builder.kind();

const SUMMARY_RENDERERS: Partial<Record<EventKind, SummaryRenderer>> = {
  [EVENT_KINDS.accessRequest]: (builder) => builder.accessRequest(),
  [EVENT_KINDS.accessResponse]: (builder) => builder.accessResponse(),
  [EVENT_KINDS.choice]: (builder) => builder.choice(),
  [EVENT_KINDS.choices]: (builder) => builder.choices(),
  [EVENT_KINDS.file]: (builder) => builder.file(),
  [EVENT_KINDS.forkLink]: (builder) => builder.forkLink(),
  [EVENT_KINDS.html]: (builder) => builder.html(),
  [EVENT_KINDS.prose]: (builder) => builder.prose(),
  [EVENT_KINDS.subagentOutput]: (builder) => builder.subagentOutput(),
  [EVENT_KINDS.subagentRun]: (builder) => builder.subagentRun(),
  [EVENT_KINDS.todo]: (builder) => builder.todo(),
  [EVENT_KINDS.turnEnd]: () => summaryFallbacks.turnEnded,
};

export function shortSummary(event: AnyEventRecord): string {
  return new EventSummaryBuilder(event).summary();
}
