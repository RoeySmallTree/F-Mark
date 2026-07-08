import type {
  AnyEventRecord,
  ChoiceCustomOption,
  ChoicePayload,
  ChoicesOption,
  ChoicesPayload,
  Participant,
  ProsePayload,
} from "@f-mark/shared";
import { createClient, type RootScope } from "../../api/client.js";
import { createManagedAgentsClient } from "../../api/managedAgents.js";
import { rootScopeForSession, scopeToBody } from "../../api/rootScope.js";
import { copyToClipboard } from "../../render/copy.js";
import {
  readChoiceEndsTurn,
  readCommentEndsTurn,
} from "../../state/settings.js";
import { useStore } from "../../state/store.js";
import { formatWhen, whoOf } from "../format.js";
import type {
  ChoiceOptionComment,
  ChoicesCardModel,
  ChoicesModelInput,
} from "./types.js";

const NO_LOOSE_STRING_VALUES = {
  embedded: "embedded",
  preview: "preview",
  choice: "choice",
  prose: "prose",
  comment: "comment",
  userMessage: "user-message",
  customPrefix: "custom",
  agent: "agent",
} as const;

type OptionIdentity = Pick<ChoicesOption | ChoiceCustomOption, "id" | "label">;

export function useChoicesCardModel({
  event,
  participants,
  allEvents,
  variant,
}: ChoicesModelInput): ChoicesCardModel {
  const payload = event.payload as ChoicesPayload;
  const token = useStore((state) => state.token);
  const sessionId = useStore((state) => state.currentSessionId);
  const userId = useStore((state) => state.currentUserId);
  const openHtmlPreview = useStore((state) => state.openHtmlPreview);
  const sessions = useStore((state) => state.sessions);
  const activePath = useStore((state) => state.activePath);
  const activePathId = useStore((state) => state.activePathId);
  const storeEvents = useStore((state) => state.events);
  const isEmbedded = variant === NO_LOOSE_STRING_VALUES.embedded;
  const choiceLookupEvents = isEmbedded ? storeEvents : allEvents;
  const latest = latestChoiceEvent(choiceLookupEvents, payload.id, userId);
  const latestPayload = latest?.payload as ChoicePayload | undefined;
  const selectedIds = latestPayload?.selected ?? [];
  const customOptions = selectedCustomOptions(latestPayload);
  const commentLookupEvents = isEmbedded ? storeEvents : allEvents;

  function currentScope(): RootScope | null {
    if (sessionId === null) return null;
    return rootScopeForSession(
      sessions.find((session) => session.id === sessionId),
      activePathId,
      activePath,
    );
  }

  async function postChoiceSelection(
    selected: string[],
    selectedCustomOptions: ChoiceCustomOption[],
  ): Promise<void> {
    if (sessionId === null || userId === null) return;
    const scope = currentScope();
    if (scope === null) return;
    const client = createClient({ baseUrl: "", token });
    const response = await client.postChoice(
      sessionId,
      {
        participant_id: userId,
        choices_id: payload.id,
        selected,
        ...(selectedCustomOptions.length > 0
          ? { custom_options: selectedCustomOptions }
          : {}),
      },
      scope,
    );
    if (readChoiceEndsTurn()) {
      await client.postTurnEnd(sessionId, userId, scope);
      const managedClient = createManagedAgentsClient({ baseUrl: "", token });
      await managedClient.wakeSession(sessionId, {
        reason: NO_LOOSE_STRING_VALUES.userMessage,
        source_event: response.filename,
        ...scopeToBody(scope),
      });
    }
  }

  async function pick(optionId: string): Promise<void> {
    const selected = nextSelectedIds(payload.multi, selectedIds, optionId);
    await postChoiceSelection(
      selected,
      customOptions.filter((option) => selected.includes(option.id)),
    );
  }

  async function pickCustom(label: string): Promise<void> {
    const trimmed = label.trim();
    if (trimmed.length === 0) return;
    const customOption = { id: customOptionId(), label: trimmed };
    const selected = payload.multi
      ? [...selectedIds, customOption.id]
      : [customOption.id];
    const nextCustomOptions = payload.multi
      ? [...customOptions, customOption]
      : [customOption];
    await postChoiceSelection(selected, nextCustomOptions);
  }

  async function commentOnOption(
    option: OptionIdentity,
    text: string,
  ): Promise<void> {
    const trimmed = text.trim();
    if (trimmed.length === 0) return;
    if (sessionId === null || userId === null) return;
    const scope = currentScope();
    if (scope === null) return;
    const client = createClient({ baseUrl: "", token });
    const response = await client.postProse(
      sessionId,
      {
        participant_id: userId,
        content: optionCommentContent(option, trimmed),
        append_to: event.filename,
        mode: NO_LOOSE_STRING_VALUES.comment,
      },
      scope,
    );
    if (readCommentEndsTurn()) {
      await client.postTurnEnd(sessionId, userId, scope);
    }
    const targetIds = optionCommentTargetIds(event.participant_id, participants);
    if (targetIds.length > 0) {
      const managedClient = createManagedAgentsClient({ baseUrl: "", token });
      await managedClient.wakeSession(sessionId, {
        reason: NO_LOOSE_STRING_VALUES.comment,
        source_event: response.filename,
        target_participant_ids: targetIds,
        ...scopeToBody(scope),
      });
    }
  }

  function commentsForOption(option: OptionIdentity): ChoiceOptionComment[] {
    return optionCommentsFor(
      commentLookupEvents,
      participants,
      event.filename,
      option,
    );
  }

  function openPreview(filename: string, title: string): void {
    if (sessionId === null) return;
    openHtmlPreview({ sessionId, filename, title, mode: NO_LOOSE_STRING_VALUES.preview });
  }

  return {
    event,
    payload,
    who: whoOf(event.participant_id, participants),
    sessionId,
    selectedIds,
    customOptions,
    latest,
    hasHtml: payload.options.some(hasHtmlOption),
    isEmbedded,
    pick,
    pickCustom,
    commentOnOption,
    commentsForOption,
    openPreview,
    formatTimestamp: formatWhen,
  };
}

export function copyChoicesQuestion(model: ChoicesCardModel): void {
  void copyToClipboard(model.payload.question);
}

function latestChoiceEvent(
  events: ChoicesModelInput["allEvents"],
  choicesId: string,
  userId: string | null,
): ChoicesCardModel["latest"] {
  const myChoices = events
    .filter(
      (event) =>
        event.kind === NO_LOOSE_STRING_VALUES.choice &&
        (event.payload as ChoicePayload).choices_id === choicesId &&
        (userId === null || event.participant_id === userId),
    )
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  return myChoices[myChoices.length - 1];
}

function selectedCustomOptions(
  latestPayload: ChoicePayload | undefined,
): ChoiceCustomOption[] {
  if (latestPayload?.custom_options === undefined) return [];
  const selected = new Set(latestPayload.selected);
  return latestPayload.custom_options.filter(
    (option) => selected.has(option.id) && option.label.trim().length > 0,
  );
}

function nextSelectedIds(
  multi: boolean | undefined,
  selectedIds: string[],
  optionId: string,
): string[] {
  if (!multi) return [optionId];
  return selectedIds.includes(optionId)
    ? selectedIds.filter((id) => id !== optionId)
    : [...selectedIds, optionId];
}

function customOptionId(): string {
  return `${NO_LOOSE_STRING_VALUES.customPrefix}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;
}

function optionCommentHeader(option: OptionIdentity): string {
  return `Commented on option ${option.id} — ${option.label}`;
}

function optionCommentContent(option: OptionIdentity, text: string): string {
  return `${optionCommentHeader(option)}:\n\n${text}`;
}

function optionCommentBody(
  content: string,
  option: OptionIdentity,
): string | null {
  const prefix = `${optionCommentHeader(option)}:\n\n`;
  return content.startsWith(prefix) ? content.slice(prefix.length) : null;
}

function optionCommentsFor(
  events: readonly AnyEventRecord[],
  participants: Record<string, Participant>,
  choicesFilename: string,
  option: OptionIdentity,
): ChoiceOptionComment[] {
  const comments: ChoiceOptionComment[] = [];
  for (const event of events) {
    if (event.kind !== NO_LOOSE_STRING_VALUES.prose) continue;
    const payload = event.payload as ProsePayload;
    if (
      payload.append_to !== choicesFilename ||
      payload.mode !== NO_LOOSE_STRING_VALUES.comment
    ) {
      continue;
    }
    const content = optionCommentBody(payload.content, option);
    if (content === null) continue;
    comments.push({
      filename: event.filename,
      author: whoOf(event.participant_id, participants).name,
      timestamp: event.timestamp,
      body: content,
    });
  }
  return comments.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

function optionCommentTargetIds(
  participantId: string,
  participants: Record<string, Participant>,
): string[] {
  return participants[participantId]?.kind === NO_LOOSE_STRING_VALUES.agent
    ? [participantId]
    : [];
}

function hasHtmlOption(option: ChoicesPayload["options"][number]): boolean {
  return typeof option.html === "string" && option.html.length > 0;
}
