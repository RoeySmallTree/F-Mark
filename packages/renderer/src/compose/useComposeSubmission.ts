import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
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
     awaits and discards it. Guarded on its own ref, separate from the other
     three actions below - see withReentrancyGuard's call sites. */
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
     spawnsInFlight ref.

     Two separate refs, not one shared ref: submit / endTurnAndWake /
     submitAndMaybeEndTurn are genuinely one mutually-exclusive action - they
     all drive the same Send/End-Turn button and the same `busy` state, so
     they share inFlightRef. The standalone `endTurn` fires from a DIFFERENT
     control (useComposeRootActions' onCreateTodoCreated, once
     messageEndsTurn is on and a todo popover closes) whose trigger button is
     gated only on sessionId, never on `busy`. A shared ref meant a submit in
     flight silently swallowed that endTurn call - the guard rejected it, the
     popover closed normally, and nothing told the user their turn never
     ended. Keying it separately fixes that; it needs its own ref because,
     unlike spawn's many-runtimes case, there's nothing else to key it by. */
  const inFlightRef = useRef(false);
  const endTurnRef = useRef(false);
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
     submit-then-end-turn) runs through this so a second in-flight call on
     the SAME ref is rejected before it can touch `busy` state at all —
     re-entrancy first, visual state second. The ref is per-caller (see the
     two refs above), so two DIFFERENT actions can be in flight at once
     without either blocking the other.

     `drivesBusy` defaults to true because `busy` is the Send/End-Turn
     button's own state, and every caller but one owns that button. The one
     exception (the standalone `endTurn` below) opts out. */
  const withReentrancyGuard = useCallback(
    async (
      guardRef: MutableRefObject<boolean>,
      action: () => Promise<void>,
      { drivesBusy = true }: { drivesBusy?: boolean } = {},
    ): Promise<void> => {
      if (guardRef.current) return;
      guardRef.current = true;
      if (drivesBusy) setBusy(true);
      try {
        await action();
      } finally {
        guardRef.current = false;
        if (drivesBusy) setBusy(false);
      }
    },
    [],
  );

  const submit = useCallback(
    (): Promise<void> =>
      withReentrancyGuard(inFlightRef, async () => {
        finishSubmit(await controller.submit());
      }),
    [controller, finishSubmit, withReentrancyGuard],
  );

  /* Guarded on its own ref (endTurnRef), not the shared inFlightRef: this
     fires from a different control than submit/endTurnAndWake/
     submitAndMaybeEndTurn — useComposeRootActions' onCreateTodoCreated calls
     it when messageEndsTurn is on, after the todo popover has already
     closed (see submitTodo.ts: onClose() runs before onCreated()). It
     returns void rather than the controller's boolean because the sole
     caller awaits and discards it, and a guard-rejected call has no honest
     boolean to report.

     drivesBusy: false — by the time this runs there is no popover left to
     show busy in, and the compose bar's `busy` belongs to its own
     Send/End-Turn button. Flipping that button's busy state for a call the
     user didn't trigger by pressing it would be its own small version of the
     bug this fix exists for: a real Send click landing while this is in
     flight would see the button looking busy/disabled for a reason that has
     nothing to do with what the user just did. */
  const endTurn = useCallback(
    (): Promise<void> =>
      withReentrancyGuard(
        endTurnRef,
        async () => {
          await controller.endTurn();
        },
        { drivesBusy: false },
      ),
    [controller, withReentrancyGuard],
  );

  const endTurnAndWake = useCallback(
    (): Promise<void> =>
      withReentrancyGuard(inFlightRef, async () => {
        const posted = await controller.endTurn();
        if (!posted) return;
        await controller.wakeAfterUserMessage();
      }),
    [controller, withReentrancyGuard],
  );

  const submitAndMaybeEndTurn = useCallback(
    (): Promise<void> =>
      withReentrancyGuard(inFlightRef, async () => {
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
