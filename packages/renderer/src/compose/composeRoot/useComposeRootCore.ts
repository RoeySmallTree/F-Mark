import { useEffect } from "react";
import { useCurrentSessionRootScope } from "../../hooks/useCurrentSessionRootScope.js";
import { type ComposeMode } from "../composeHelpers.js";
import { useComposePopovers } from "../useComposePopovers.js";
import { useComposeSettings } from "../useComposeSettings.js";
import { useComposeStoreBindings } from "../useComposeStoreBindings.js";
import { useComposeTextDraft } from "../useComposeTextDraft.js";
import type { ComposeRootCore } from "./types.js";

const NO_LOOSE_STRING_VALUES = {
  named: "named",
  message: "message",
  comment: "comment",
} as const;

export function useComposeRootCore(): ComposeRootCore {
  const {
    token,
    sessionId,
    userId,
    mode,
    setMode,
    composeDraft,
    setComposeDraft,
    composeInsertion,
    clearComposeInsertion,
    requestScrollToBottom,
  } = useComposeStoreBindings();
  const activeMode: ComposeMode = mode === NO_LOOSE_STRING_VALUES.named ? NO_LOOSE_STRING_VALUES.named : NO_LOOSE_STRING_VALUES.message;
  const currentScope = useCurrentSessionRootScope(sessionId);
  const settings = useComposeSettings();
  const textDraft = useComposeTextDraft({
    activeMode,
    composeDraft,
    setComposeDraft,
    composeInsertion,
    clearComposeInsertion,
    setMode,
  });
  const popovers = useComposePopovers({
    sessionId,
    textareaRef: textDraft.textareaRef,
  });

  useEffect(() => {
    if (mode === NO_LOOSE_STRING_VALUES.comment) setMode(NO_LOOSE_STRING_VALUES.message);
  }, [mode, setMode]);

  return {
    token,
    sessionId,
    userId,
    activeMode,
    currentScope,
    setMode,
    requestScrollToBottom,
    settings,
    textDraft,
    popovers,
  };
}
