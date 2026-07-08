import type { ChoicePayload, ChoicesPayload } from "@f-mark/shared";
import { createClient } from "../../api/client.js";
import { rootScopeForSession } from "../../api/rootScope.js";
import { copyToClipboard } from "../../render/copy.js";
import { readChoiceEndsTurn } from "../../state/settings.js";
import { useStore } from "../../state/store.js";
import { formatWhen, whoOf } from "../format.js";
import type { ChoicesCardModel, ChoicesModelInput } from "./types.js";

const NO_LOOSE_STRING_VALUES = {
  embedded: "embedded",
  preview: "preview",
  choice: "choice",
} as const;

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
  const selectedIds =
    (latest?.payload as ChoicePayload | undefined)?.selected ?? [];

  async function pick(optionId: string): Promise<void> {
    if (sessionId === null || userId === null) return;
    const scope = rootScopeForSession(
      sessions.find((session) => session.id === sessionId),
      activePathId,
      activePath,
    );
    if (scope === null) return;
    const client = createClient({ baseUrl: "", token });
    const selected = nextSelectedIds(payload.multi, selectedIds, optionId);
    await client.postChoice(
      sessionId,
      {
        participant_id: userId,
        choices_id: payload.id,
        selected,
      },
      scope,
    );
    if (readChoiceEndsTurn()) {
      await client.postTurnEnd(sessionId, userId, scope);
    }
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
    latest,
    hasHtml: payload.options.some(hasHtmlOption),
    isEmbedded,
    pick,
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

function hasHtmlOption(option: ChoicesPayload["options"][number]): boolean {
  return typeof option.html === "string" && option.html.length > 0;
}
