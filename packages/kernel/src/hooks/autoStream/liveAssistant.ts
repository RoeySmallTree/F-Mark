import type { ProjectedEvent } from "../projectTurn.js";
import type { HookPayload } from "./types.js";
import { nonBlankString, stringField } from "./fields.js";

export class LiveAssistantTextExtractor {
  isHook(payload: HookPayload): boolean {
    return stringField(payload, "hook_event_name") === "MessageDisplay";
  }

  extract(input: {
    payload: HookPayload;
    participantId: string;
    runtimeId: string | null;
  }): Extract<ProjectedEvent, { kind: "prose" }> | null {
    if (!this.isHook(input.payload)) return null;
    const content = this.assistantTextFromValue(input.payload);
    return content === undefined
      ? null
      : { kind: "prose", content, arbitrary: true };
  }

  private assistantTextFromValue(value: unknown, depth = 0): string | undefined {
    if (depth > 4) return undefined;
    if (typeof value === "string") return nonBlankString(value);
    if (Array.isArray(value)) return this.textFromArray(value, depth);
    if (value === null || typeof value !== "object") return undefined;
    return this.textFromRecord(value as Record<string, unknown>, depth);
  }

  private textFromArray(values: unknown[], depth: number): string | undefined {
    const joined = values
      .map((item) => this.assistantTextFromValue(item, depth + 1))
      .filter((part): part is string => part !== undefined)
      .join("");
    return nonBlankString(joined);
  }

  private textFromRecord(
    record: Record<string, unknown>,
    depth: number,
  ): string | undefined {
    for (const key of [
      "delta",
      "text",
      "content",
      "output_text",
      "last_assistant_message",
      "message",
    ]) {
      const text = this.assistantTextFromValue(record[key], depth + 1);
      if (text !== undefined) return text;
    }
    return undefined;
  }
}
