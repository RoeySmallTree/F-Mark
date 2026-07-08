import { useCallback, useMemo, useState } from "react";
import type { ProseMention } from "@f-mark/shared";
import type { RootScope } from "../api/client.js";
import type { StagedAttachment } from "./AttachmentChip.js";
import {
  ComposeSubmissionController,
  type ComposeSubmitResult,
} from "./ComposeSubmissionController.js";
import type { ComposeMode } from "./composeHelpers.js";

const NO_LOOSE_STRING_VALUES = {
  named: "named",
  message: "message",
} as const;

interface UseComposeSubmissionOptions {
  token: string | null;
  sessionId: string | null;
  userId: string | null;
  currentScope: RootScope | null;
  activeMode: ComposeMode;
  content: string;
  name: string;
  selectedMentions: ProseMention[];
  attachments: StagedAttachment[];
  messageEndsTurn: boolean;
  clearAfterSubmit(): void;
  discardAttachments(ids: Set<string>): void;
  requestScrollToBottom(): void;
}

export interface ComposeSubmissionState {
  busy: boolean;
  hasContent: boolean;
  hasSendableAttachments: boolean;
  canSubmit: boolean;
  submit(): Promise<void>;
  endTurn(): Promise<boolean>;
  endTurnAndWake(): Promise<void>;
  submitAndMaybeEndTurn(): Promise<void>;
  sendOrEndTurn(): Promise<void>;
}

export function useComposeSubmission({
  token,
  sessionId,
  userId,
  currentScope,
  activeMode,
  content,
  name,
  selectedMentions,
  attachments,
  messageEndsTurn,
  clearAfterSubmit,
  discardAttachments,
  requestScrollToBottom,
}: UseComposeSubmissionOptions): ComposeSubmissionState {
  const [busy, setBusy] = useState(false);
  const hasContent = content.trim().length > 0;
  const hasSendableAttachments = useMemo(
    () =>
      attachments.some(
        (attachment) => !attachment.uploading && !attachment.error,
      ),
    [attachments],
  );
  const canSubmit = useMemo(() => {
    if (sessionId === null) return false;
    if (userId === null) return false;
    if (!hasContent && !hasSendableAttachments) return false;
    if (activeMode === NO_LOOSE_STRING_VALUES.named && name.trim().length === 0) return false;
    return true;
  }, [
    activeMode,
    hasContent,
    hasSendableAttachments,
    name,
    sessionId,
    userId,
  ]);

  const controller = useMemo(
    () =>
      new ComposeSubmissionController({
        token,
        sessionId,
        userId,
        scope: currentScope,
        mode: activeMode,
        content,
        name,
        mentions: selectedMentions,
        attachments,
        messageEndsTurn,
        hasContent,
        canSubmit,
      }),
    [
      activeMode,
      attachments,
      canSubmit,
      content,
      currentScope,
      hasContent,
      messageEndsTurn,
      name,
      selectedMentions,
      sessionId,
      token,
      userId,
    ],
  );

  const finishSubmit = useCallback(
    (result: ComposeSubmitResult | null): void => {
      if (result === null) return;
      clearAfterSubmit();
      discardAttachments(result.sentAttachmentIds);
      requestScrollToBottom();
    },
    [clearAfterSubmit, discardAttachments, requestScrollToBottom],
  );

  const submit = useCallback(async (): Promise<void> => {
    setBusy(true);
    try {
      finishSubmit(await controller.submit());
    } finally {
      setBusy(false);
    }
  }, [controller, finishSubmit]);

  const endTurn = useCallback(
    async (): Promise<boolean> => controller.endTurn(),
    [controller],
  );

  const endTurnAndWake = useCallback(async (): Promise<void> => {
    const posted = await controller.endTurn();
    if (!posted) return;
    await controller.wakeAfterUserMessage();
  }, [controller]);

  const submitAndMaybeEndTurn = useCallback(async (): Promise<void> => {
    const shouldEndTurn = activeMode === NO_LOOSE_STRING_VALUES.message && messageEndsTurn;
    setBusy(true);
    try {
      const result = await controller.submit({ wake: !shouldEndTurn });
      finishSubmit(result);
      if (shouldEndTurn && result !== null) {
        const posted = await controller.endTurn();
        if (posted) await controller.wakeAfterSubmittedMessage();
      }
    } finally {
      setBusy(false);
    }
  }, [activeMode, controller, finishSubmit, messageEndsTurn]);

  const sendOrEndTurn = useCallback(async (): Promise<void> => {
    if (activeMode === NO_LOOSE_STRING_VALUES.message && !canSubmit) {
      await endTurnAndWake();
      return;
    }
    await submitAndMaybeEndTurn();
  }, [activeMode, canSubmit, endTurnAndWake, submitAndMaybeEndTurn]);

  return {
    busy,
    hasContent,
    hasSendableAttachments,
    canSubmit,
    submit,
    endTurn,
    endTurnAndWake,
    submitAndMaybeEndTurn,
    sendOrEndTurn,
  };
}
