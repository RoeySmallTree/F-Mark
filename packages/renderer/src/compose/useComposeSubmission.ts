import { useCallback, useMemo, useRef, useState } from "react";
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
  /* void, not the controller's boolean: every action here is re-entrancy
     guarded, and a call rejected by the guard has no honest boolean to
     return. The sole caller (useComposeRootActions' onCreateTodoCreated)
     awaits and discards it. */
  endTurn(): Promise<void>;
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
  /* Synchronous in-flight guard: a double-click or Enter-then-click fires two
     handler calls before React re-renders `busy`, so state-derived disabling
     alone can't catch the second one — mirrors useSpawnRuntimeAction's
     spawnsInFlight ref. Unlike spawn (many runtimes, one card each), the
     compose bar has a single primary action, so a plain boolean ref is the
     right key — there's nothing to key it by. */
  const inFlightRef = useRef(false);
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

  /* Every user-triggered action (submit, end-turn, or the combined
     submit-then-end-turn) runs through this so a second in-flight call is
     rejected before it can touch `busy` state at all — re-entrancy first,
     visual state second. */
  const withReentrancyGuard = useCallback(
    async (action: () => Promise<void>): Promise<void> => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      setBusy(true);
      try {
        await action();
      } finally {
        inFlightRef.current = false;
        setBusy(false);
      }
    },
    [],
  );

  const submit = useCallback(
    (): Promise<void> =>
      withReentrancyGuard(async () => {
        finishSubmit(await controller.submit());
      }),
    [controller, finishSubmit, withReentrancyGuard],
  );

  /* Guarded like the rest: this is user-triggered too — useComposeRootActions
     calls it from onCreateTodoCreated when messageEndsTurn is on, so creating
     a todo ends the turn through here. It returns void rather than the
     controller's boolean because the sole caller awaits and discards it, and
     a guard-rejected call has no honest boolean to report. */
  const endTurn = useCallback(
    (): Promise<void> =>
      withReentrancyGuard(async () => {
        await controller.endTurn();
      }),
    [controller, withReentrancyGuard],
  );

  const endTurnAndWake = useCallback(
    (): Promise<void> =>
      withReentrancyGuard(async () => {
        const posted = await controller.endTurn();
        if (!posted) return;
        await controller.wakeAfterUserMessage();
      }),
    [controller, withReentrancyGuard],
  );

  const submitAndMaybeEndTurn = useCallback(
    (): Promise<void> =>
      withReentrancyGuard(async () => {
        const shouldEndTurn = activeMode === NO_LOOSE_STRING_VALUES.message && messageEndsTurn;
        const result = await controller.submit({ wake: !shouldEndTurn });
        finishSubmit(result);
        if (shouldEndTurn && result !== null) {
          const posted = await controller.endTurn();
          if (posted) await controller.wakeAfterSubmittedMessage();
        }
      }),
    [activeMode, controller, finishSubmit, messageEndsTurn, withReentrancyGuard],
  );

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
