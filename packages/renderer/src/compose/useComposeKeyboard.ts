import {
  useCallback,
  useMemo,
  type KeyboardEvent,
} from "react";
import { useHotkeys, type HotkeyMap } from "../hooks/useHotkeys.js";

interface UseComposeKeyboardOptions {
  enterToSend: boolean;
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
      void sendOrEndTurn();
    },
    [enterToSend, handleEscape, sendOrEndTurn],
  );

  const hotkeyMap = useMemo<HotkeyMap>(
    () => ({
      "$mod+n": toggleNamed,
      "$mod+p": openPresets,
      "$mod+shift+k": openSkills,
      "$mod+enter": () => {
        void sendOrEndTurn();
      },
      escape: () => {
        if (handleEscape()) return;
        return false;
      },
    }),
    [handleEscape, openPresets, openSkills, sendOrEndTurn, toggleNamed],
  );
  useHotkeys(hotkeyMap);

  return onTextareaKey;
}
