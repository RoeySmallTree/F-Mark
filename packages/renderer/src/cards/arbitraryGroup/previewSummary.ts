import {
  EVENT_KINDS,
  type AnyEventRecord,
  type ProsePayload,
  type ToolUsePayload,
} from "@f-mark/shared";
import { presentToolUse } from "../toolPresentation.js";
import { RENDER_ITEM_TYPES, type RenderItem } from "./types.js";

const NARRATIVE_MAX = 160;

export interface ToolChipSummary {
  key: string;
  name: string;
  count: number;
  detailText: string;
}

export interface PreviewSummary {
  tools: ToolChipSummary[];
  subagentCount: number;
  narrativeText: string | null;
}

export function buildPreviewSummary(items: RenderItem[]): PreviewSummary {
  const tools = new Map<string, ToolChipSummary>();
  let subagentCount = 0;
  let latestThinking: string | null = null;
  let latestToolText: string | null = null;

  for (const item of items) {
    switch (item.type) {
      case RENDER_ITEM_TYPES.event:
        ingestEvent(item.event, tools, (thinking) => {
          latestThinking = thinking;
        }, (toolText) => {
          latestToolText = toolText;
        });
        break;
      case RENDER_ITEM_TYPES.proseRun: {
        const text = cleanText(item.content);
        if (text.length > 0) latestThinking = text;
        break;
      }
      case RENDER_ITEM_TYPES.subagent:
        subagentCount += 1;
        break;
    }
  }

  const toolList = [...tools.values()];
  const narrativeSource = latestThinking ?? latestToolText;
  const narrativeText =
    narrativeSource === null
      ? null
      : suppressRedundantNarrative(
          truncate(cleanText(narrativeSource)),
          latestThinking !== null,
          toolList,
          subagentCount,
        );

  return {
    tools: toolList,
    subagentCount,
    narrativeText,
  };
}

function suppressRedundantNarrative(
  text: string,
  isThinking: boolean,
  tools: ToolChipSummary[],
  subagentCount: number,
): string | null {
  if (isThinking || text.length === 0) return text;
  if (tools.length !== 1 || subagentCount > 0) return text;
  const [tool] = tools;
  if (!tool) return text;
  const normalized = text.toLowerCase();
  if (
    normalized === tool.name.toLowerCase() ||
    (normalized === tool.detailText.toLowerCase() &&
      tool.detailText.length <= tool.name.length + 4)
  ) {
    return null;
  }
  return text;
}

function ingestEvent(
  event: AnyEventRecord,
  tools: Map<string, ToolChipSummary>,
  onThinking: (text: string) => void,
  onToolText: (text: string) => void,
): void {
  if (event.kind === EVENT_KINDS.toolUse) {
    const payload = event.payload as ToolUsePayload;
    const presentation = presentToolUse(payload);
    const title = presentation?.intro ?? presentation?.title ?? payload.tool_name;
    const detail =
      presentation?.intro === undefined ? presentation?.titleDetail : undefined;
    const summary =
      presentation?.intro === undefined ? presentation?.summary : undefined;
    const text = cleanText([title, detail, summary].filter(Boolean).join(" "));
    onToolText(text);

    const existing = tools.get(payload.tool_name);
    if (existing) {
      existing.count += 1;
      return;
    }
    tools.set(payload.tool_name, {
      key: event.filename,
      name: payload.tool_name,
      count: 1,
      detailText: text,
    });
    return;
  }

  if (event.kind === EVENT_KINDS.prose) {
    const payload = event.payload as ProsePayload & { arbitrary?: unknown };
    if (payload.arbitrary !== true) return;
    const text = cleanText(payload.content);
    if (text.length > 0) onThinking(text);
  }
}

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function truncate(value: string): string {
  if (value.length <= NARRATIVE_MAX) return value;
  return `${value.slice(0, NARRATIVE_MAX - 1).trimEnd()}…`;
}
