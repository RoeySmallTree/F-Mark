import { type JSX } from "react";
import type { ProseMention } from "@f-mark/shared";
import type { SessionMeta } from "../api/client.js";
import { AgentMentionPicker } from "../components/AgentMentionPicker.js";
import { ForkSessionPopover } from "../components/ForkSessionPopover.js";
import { resolveActiveAgent } from "../modals/skills/active-agent.js";
import { PresetsPopover } from "../popovers/PresetsPopover.js";
import { useDeferredUnmount, useHeldAnchorRect } from "../popovers/useDeferredUnmount.js";
import { useStore } from "../state/store.js";
import { ComposeSettingsPopover } from "./ComposeSettingsPopover.js";
import { CreateTodoPopover } from "./CreateTodoPopover.js";
import { SkillsPopover } from "./SkillsPopover.js";
import type { SkillTrigger } from "./skillsTrigger.js";
import type { ComposeSettingsState } from "./useComposeSettings.js";

const NO_LOOSE_STRING_VALUES = {
  presets: "presets",
  composeSettings: "compose-settings",
} as const;

interface Props {
  activePopover: ReturnType<typeof useStore.getState>["activePopover"];
  token: string | null;
  sessionId: string | null;
  selectedMentionIds: Set<string>;
  mentionAnchorRect: DOMRect | null;
  createTodoAnchorRect: DOMRect | null;
  forkAnchorRect: DOMRect | null;
  skillsAnchorRect: DOMRect | null;
  skillsTrigger: SkillTrigger | null;
  skillsRefreshKey: number;
  forkTarget: SessionMeta | null;
  settings: ComposeSettingsState;
  createTodoEndsTurn: boolean;
  onClosePopover(): void;
  onAddMention(mention: ProseMention): void;
  onCloseMentions(): void;
  onCloseCreateTodo(): void;
  onCloseFork(): void;
  onCloseSkills(): void;
  onEditSkill: ReturnType<typeof useStore.getState>["openSkillEditor"];
  onInsertSkill(text: string, trigger: SkillTrigger | null): void;
  onCreateTodoCreated(): Promise<void>;
}

export function ComposePopovers({
  activePopover,
  token,
  sessionId,
  selectedMentionIds,
  mentionAnchorRect,
  createTodoAnchorRect,
  forkAnchorRect,
  skillsAnchorRect,
  skillsTrigger,
  skillsRefreshKey,
  forkTarget,
  settings,
  createTodoEndsTurn,
  onClosePopover,
  onAddMention,
  onCloseMentions,
  onCloseCreateTodo,
  onCloseFork,
  onCloseSkills,
  onEditSkill,
  onInsertSkill,
  onCreateTodoCreated,
}: Props): JSX.Element {
  const participants = useStore((s) => s.participants);
  const activeAgent = resolveActiveAgent(participants, sessionId);

  const presetsOpen = activePopover.key === NO_LOOSE_STRING_VALUES.presets;
  const presets = useDeferredUnmount(presetsOpen);
  const presetsRect = useHeldAnchorRect(
    presetsOpen ? activePopover.anchorRect : null,
  );

  const mentions = useDeferredUnmount(mentionAnchorRect !== null);
  const mentionsRect = useHeldAnchorRect(mentionAnchorRect);

  const composeSettingsOpen =
    activePopover.key === NO_LOOSE_STRING_VALUES.composeSettings;
  const composeSettings = useDeferredUnmount(composeSettingsOpen);
  const composeSettingsRect = useHeldAnchorRect(
    composeSettingsOpen ? activePopover.anchorRect : null,
  );

  const createTodo = useDeferredUnmount(createTodoAnchorRect !== null);
  const createTodoRect = useHeldAnchorRect(createTodoAnchorRect);

  const fork = useDeferredUnmount(forkAnchorRect !== null);
  const forkRect = useHeldAnchorRect(forkAnchorRect);

  const skills = useDeferredUnmount(skillsAnchorRect !== null);
  const skillsRect = useHeldAnchorRect(skillsAnchorRect);

  return (
    <>
      {presets.mounted ? (
        <PresetsPopover
          anchorRect={presetsRect}
          onClose={onClosePopover}
          closing={presets.closing}
        />
      ) : null}
      {mentions.mounted && mentionsRect !== null ? (
        <AgentMentionPicker
          anchorRect={mentionsRect}
          sessionId={sessionId}
          token={token}
          participants={participants}
          selectedIds={selectedMentionIds}
          onSelect={onAddMention}
          closeOnSelect
          onClose={onCloseMentions}
          closing={mentions.closing}
        />
      ) : null}
      {composeSettings.mounted ? (
        <ComposeSettingsPopover
          anchorRect={composeSettingsRect}
          onClose={onClosePopover}
          closing={composeSettings.closing}
          messageEndsTurn={settings.messageEndsTurn}
          onMessageEndsTurnChange={settings.handleMessageEndsTurnChange}
          commentEndsTurn={settings.commentEndsTurn}
          onCommentEndsTurnChange={settings.handleCommentEndsTurnChange}
          choiceEndsTurn={settings.choiceEndsTurn}
          onChoiceEndsTurnChange={settings.handleChoiceEndsTurnChange}
          enterToSend={settings.enterToSend}
          onEnterToSendChange={settings.handleEnterToSendChange}
        />
      ) : null}
      {createTodo.mounted ? (
        <CreateTodoPopover
          anchorRect={createTodoRect}
          onClose={onCloseCreateTodo}
          closing={createTodo.closing}
          endTurnAfter={createTodoEndsTurn}
          onCreated={onCreateTodoCreated}
        />
      ) : null}
      {fork.mounted && forkTarget !== null ? (
        <ForkSessionPopover
          anchorRect={forkRect}
          target={forkTarget}
          onClose={onCloseFork}
          closing={fork.closing}
        />
      ) : null}
      {skills.mounted ? (
        <SkillsPopover
          activeAgent={activeAgent}
          anchorRect={skillsRect}
          query={skillsTrigger?.query ?? ""}
          refreshKey={skillsRefreshKey}
          token={token}
          trigger={skillsTrigger}
          onClose={onCloseSkills}
          closing={skills.closing}
          onEdit={(skill) => {
            onCloseSkills();
            onEditSkill(skill);
          }}
          onInsert={onInsertSkill}
        />
      ) : null}
    </>
  );
}
