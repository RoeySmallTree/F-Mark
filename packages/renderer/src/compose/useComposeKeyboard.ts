import {
  useCallback,
  useMemo,
  type KeyboardEvent,
} from "react";
import { useHotkeys, type HotkeyMap } from "../hooks/useHotkeys.js";

interface UseComposeKeyboardOptions {
  enterToSend: boolean;
  /* Neither Enter path below checked this, so the send button's `:disabled`
     styling only ever protected a second MOUSE click - a second Enter while
     a request was already in flight was silently swallowed by
     useComposeSubmission's reentrancy ref, with zero DOM change anywhere to
     tell the user why nothing happened. Both paths now gate on it. */
  busy: boolean;
  toggleNamed(): void;
  openPresets(): void;
  openSkills(): void;
  sendOrEndTurn(): Promise<void>;
  handleEscape(): boolean;
}

function isPlainEnter(e: KeyboardEvent<HTMLTextAreaElement>): boolean {
  return (
    e.key === "Enter" &&
    !e.shiftKey &&
    !e.metaKey &&
    !e.ctrlKey &&
    !e.altKey
  );
}

export function useComposeKeyboard({
  enterToSend,
  busy,
  toggleNamed,
  openPresets,
  openSkills,
  sendOrEndTurn,
  handleEscape,
}: UseComposeKeyboardOptions): (e: KeyboardEvent<HTMLTextAreaElement>) => void {
  const onTextareaKey = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>): void => {
      if (e.key === "Escape" && handleEscape()) {
        e.preventDefault();
        return;
      }
      if (!enterToSend || !isPlainEnter(e)) return;
      e.preventDefault();
      e.stopPropagation();
      if (busy) return;
      void sendOrEndTurn();
    },
    [busy, enterToSend, handleEscape, sendOrEndTurn],
  );

  const hotkeyMap = useMemo<HotkeyMap>(
    () => ({
      "$mod+n": toggleNamed,
      "$mod+p": openPresets,
      "$mod+shift+k": openSkills,
      "$mod+enter": () => {
        if (busy) return;
        void sendOrEndTurn();
      },
      escape: () => {
        if (handleEscape()) return;
        return false;
      },
    }),
    [busy, handleEscape, openPresets, openSkills, sendOrEndTurn, toggleNamed],
  );
  useHotkeys(hotkeyMap);

  return onTextareaKey;
}
