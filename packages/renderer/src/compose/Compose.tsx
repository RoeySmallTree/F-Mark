/* Compose — the real compose bar.
   Mirrors design.html `.compose .compose-inner …` and the prototype in
   planning/redesign/panels.jsx (ComposeBar). Replaces the legacy
   components/Composer.tsx.

   Modes (from store.composeMode):
     - message  → POST prose { participant_id, content }
     - named    → POST prose { participant_id, content, name }

   Hotkeys (via useHotkeys):
     - $mod+n    → toggle named
     - $mod+p    → open the ⚡ Presets popover anchored at the presets button
     - $mod+enter→ submit the active mode
     - escape    → blur textarea
*/

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type JSX } from "react";
import { createClient } from "../api/client.js";
import { useStore } from "../state/store.js";
import { useHotkeys, type HotkeyMap } from "../hooks/useHotkeys.js";
import {
  readEnterToSend,
  readMessageEndsTurn,
  writeEnterToSend,
  writeMessageEndsTurn,
} from "../state/settings.js";
import { chordToLabel } from "../modals/settings/shortcut-registry.js";
import { NameChip } from "./NameChip.js";
import { SendButton } from "./SendButton.js";
import { CreateTodoPopover } from "./CreateTodoPopover.js";
import { PresetsPopover } from "../popovers/PresetsPopover.js";
import { Zap, Sparkles, ListChecks, Settings2 } from "lucide-react";
import { ComposeSettingsPopover } from "./ComposeSettingsPopover.js";

const NAMED_SHORTCUT = chordToLabel("$mod+N");
const PRESETS_SHORTCUT = chordToLabel("$mod+P");
const SKILLS_SHORTCUT = chordToLabel("$mod+Shift+K");

function placeholderFor(mode: "message" | "named"): string {
  if (mode === "named") return "Write the contribution content…";
  return `Write a message or ${NAMED_SHORTCUT} to name a contribution…`;
}

export function Compose(): JSX.Element {
  const token = useStore((s) => s.token);
  const sessionId = useStore((s) => s.currentSessionId);
  const userId = useStore((s) => s.currentUserId);
  const mode = useStore((s) => s.composeMode);
  const setMode = useStore((s) => s.setComposeMode);
  const composeDraft = useStore((s) => s.composeDraft);
  const setComposeDraft = useStore((s) => s.setComposeDraft);
  const openPopover = useStore((s) => s.openPopover);
  const closePopover = useStore((s) => s.closePopover);
  const activePopover = useStore((s) => s.activePopover);
  const openModal = useStore((s) => s.openModal);

  const [content, setContent] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [messageEndsTurn, setMessageEndsTurn] = useState<boolean>(() =>
    readMessageEndsTurn(),
  );
  const [enterToSend, setEnterToSend] = useState<boolean>(() =>
    readEnterToSend(),
  );

  const handleMessageEndsTurnChange = useCallback((next: boolean): void => {
    setMessageEndsTurn(next);
    writeMessageEndsTurn(next);
  }, []);

  const handleEnterToSendChange = useCallback((next: boolean): void => {
    setEnterToSend(next);
    writeEnterToSend(next);
  }, []);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const presetsBtnRef = useRef<HTMLButtonElement | null>(null);
  const createTodoBtnRef = useRef<HTMLButtonElement | null>(null);
  const settingsBtnRef = useRef<HTMLButtonElement | null>(null);
  const [createTodoAnchorRect, setCreateTodoAnchorRect] =
    useState<DOMRect | null>(null);
  const activeMode: "message" | "named" =
    mode === "named" ? "named" : "message";

  useEffect(() => {
    if (mode === "comment") setMode("message");
  }, [mode, setMode]);

  // canSubmit mirrors legacy Composer.
  const canSubmit = useMemo(() => {
    if (sessionId === null) return false;
    if (userId === null) return false;
    if (content.trim().length === 0) return false;
    if (activeMode === "named" && name.trim().length === 0) return false;
    return true;
  }, [sessionId, userId, content, activeMode, name]);

  const submit = useCallback(async (): Promise<void> => {
    if (!canSubmit || sessionId === null || userId === null) return;
    setBusy(true);
    try {
      const client = createClient({ baseUrl: "", token });
      const body: {
        participant_id: string;
        content: string;
        name?: string;
      } = { participant_id: userId, content };
      if (activeMode === "named") body.name = name.trim();
      await client.postProse(sessionId, body);
      setContent("");
      if (activeMode === "named") setName("");
    } finally {
      setBusy(false);
    }
  }, [
    canSubmit,
    sessionId,
    userId,
    token,
    activeMode,
    content,
    name,
  ]);

  const endTurn = useCallback(async (): Promise<void> => {
    if (sessionId === null || userId === null) return;
    const client = createClient({ baseUrl: "", token });
    await client.postTurnEnd(sessionId, userId);
  }, [sessionId, userId, token]);

  /* The Send action: submit, then (when in message mode with the
     ends-turn toggle on) end the turn. We chain so the prose event is
     persisted before the turn-end event — out-of-order would write a
     turn-end before its contribution. */
  const submitAndMaybeEndTurn = useCallback(async (): Promise<void> => {
    await submit();
    if (activeMode === "message" && messageEndsTurn) {
      await endTurn();
    }
  }, [submit, endTurn, activeMode, messageEndsTurn]);

  const sendOrEndTurn = useCallback(async (): Promise<void> => {
    if (activeMode === "message" && !canSubmit) {
      await endTurn();
      return;
    }
    await submitAndMaybeEndTurn();
  }, [activeMode, canSubmit, endTurn, submitAndMaybeEndTurn]);

  /* openPresets — anchor the presets popover under the ⚡ button. Called
     by the button click handler and by the $mod+P hotkey. Reads the current
     button's bounding rect at the moment of invocation (the ref may not
     have settled at memo-construction time). */
  const openPresets = useCallback((): void => {
    const rect = presetsBtnRef.current?.getBoundingClientRect() ?? null;
    setCreateTodoAnchorRect(null);
    openPopover("presets", rect);
  }, [openPopover]);

  const openSettings = useCallback((e: React.MouseEvent): void => {
    e.stopPropagation();
    if (activePopover.key === "compose-settings") {
      closePopover();
      return;
    }
    const rect = settingsBtnRef.current?.getBoundingClientRect() ?? null;
    setCreateTodoAnchorRect(null);
    openPopover("compose-settings", rect);
  }, [activePopover.key, closePopover, openPopover]);

  const openCreateTodo = useCallback((): void => {
    const rect = createTodoBtnRef.current?.getBoundingClientRect() ?? null;
    closePopover();
    setCreateTodoAnchorRect(rect);
  }, [closePopover]);

  const closeCreateTodo = useCallback((): void => {
    setCreateTodoAnchorRect(null);
  }, []);

  const createTodoEndsTurn = activeMode === "message" && messageEndsTurn;

  const handleCreateTodoCreated = useCallback(async (): Promise<void> => {
    if (createTodoEndsTurn) {
      await endTurn();
    }
  }, [createTodoEndsTurn, endTurn]);

  const handleEscape = useCallback((): boolean => {
    if (
      textareaRef.current !== null &&
      document.activeElement === textareaRef.current
    ) {
      textareaRef.current.blur();
      return true;
    }
    return false;
  }, []);

  // Hotkey map — stable per-render via dependency-aware memo.
  const hotkeyMap = useMemo<HotkeyMap>(
    () => ({
      "$mod+n": () => {
        setMode(activeMode === "named" ? "message" : "named");
      },
      "$mod+p": () => {
        openPresets();
      },
      "$mod+shift+k": () => {
        openModal("skills");
      },
      "$mod+enter": () => {
        void sendOrEndTurn();
      },
      escape: () => {
        if (handleEscape()) return;
        return false;
      },
    }),
    [
      activeMode,
      setMode,
      openPresets,
      openModal,
      sendOrEndTurn,
      handleEscape,
    ],
  );

  useHotkeys(hotkeyMap);

  /* Consume composeDraft — set by external pre-fill paths (P8 presets,
     P9 skills). If the textarea is empty we replace; otherwise we append
     after a blank-line separator so we never destroy in-progress typing.
     Always clears the draft after consuming so a second open of the same
     preset still inserts again. After insertion, focus the textarea and
     place the caret at the end. */
  useEffect(() => {
    if (composeDraft === null) return;
    setContent((prev) => {
      const trimmed = prev.trim();
      if (trimmed.length === 0) return composeDraft;
      return `${prev}\n\n${composeDraft}`;
    });
    setComposeDraft(null);
    /* Focus the textarea on the next frame so the value update has flushed
       and the caret lands at the end. */
    queueMicrotask(() => {
      const ta = textareaRef.current;
      if (ta === null) return;
      ta.focus();
      const end = ta.value.length;
      try {
        ta.setSelectionRange(end, end);
      } catch {
        /* ignore — type=textarea always supports this in real browsers. */
      }
    });
  }, [composeDraft, setComposeDraft]);

  // Auto-grow the textarea up to its max-height (140px from CSS).
  useLayoutEffect(() => {
    const ta = textareaRef.current;
    if (ta === null) return;
    ta.style.height = "24px";
    const next = Math.min(ta.scrollHeight, 140);
    ta.style.height = `${next}px`;
  }, [content, activeMode]);

  function onTextareaKey(e: React.KeyboardEvent<HTMLTextAreaElement>): void {
    if (e.key === "Escape" && handleEscape()) {
      e.preventDefault();
      return;
    }
    if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
      if (enterToSend) {
        e.preventDefault();
        e.stopPropagation();
        void sendOrEndTurn();
      }
    }
  }

  const onCancelName = useCallback((): void => {
    setMode("message");
    setName("");
  }, [setMode]);

  return (
    <div className="compose-inner">
      {(content.length > 0 || activeMode === "named") && (
        <NameChip
          active={activeMode === "named"}
          value={name}
          onChange={setName}
          onActivate={() => setMode("named")}
          onCancel={onCancelName}
        />
      )}
      <div className="compose-box">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={onTextareaKey}
          placeholder={placeholderFor(activeMode)}
          rows={activeMode === "named" ? 4 : 1}
          aria-label="Compose message"
        />
        <div className="compose-actions">
          {/* Row 1 — primary stage: the morphing primary action, centered.
              The Name-it affordance now lives as a chip above the textarea. */}
          <div className="compose-actions-row compose-actions-primary">
            <SendButton
              mode={activeMode}
              canSubmit={canSubmit}
              busy={busy}
              hasContent={content.trim().length > 0}
              isAgentTurn={false}
              onSubmit={() => void submitAndMaybeEndTurn()}
              onEndTurn={() => void endTurn()}
              onInterrupt={() => {}}
            />
          </div>

          {/* Row 2 — augment launchers (Presets · Skills · Task) on the left,
              compose-settings toggle on the right (space-between). */}
          <div className="compose-actions-row compose-actions-secondary">
            <div className="compose-zone compose-zone-augments">
              <button
                ref={presetsBtnRef}
                type="button"
                className="mode-btn"
                onClick={openPresets}
                aria-label="Open presets"
                title={`Open presets (${PRESETS_SHORTCUT})`}
              >
                <Zap size={14} aria-hidden />
                <span className="dock-label">Presets</span>
              </button>
              <button
                type="button"
                className="mode-btn"
                onClick={() => {
                  closeCreateTodo();
                  openModal("skills");
                }}
                aria-label="Open skills palette"
                title={`Open skills palette (${SKILLS_SHORTCUT})`}
              >
                <Sparkles size={14} aria-hidden />
                <span className="dock-label">Skills</span>
              </button>
              <button
                ref={createTodoBtnRef}
                type="button"
                className="mode-btn"
                onClick={openCreateTodo}
                aria-label="Open create todo"
                title="Create Todo"
              >
                <ListChecks size={14} aria-hidden />
                <span className="dock-label">Task</span>
              </button>
            </div>
            <button
              ref={settingsBtnRef}
              type="button"
              className="mode-btn"
              onClick={openSettings}
              aria-label="Compose settings"
              title="Compose settings"
            >
              <Settings2 size={14} aria-hidden />
            </button>
          </div>
        </div>
      </div>
      {activePopover.key === "presets" ? (
        <PresetsPopover
          anchorRect={activePopover.anchorRect}
          onClose={closePopover}
        />
      ) : null}
      {activePopover.key === "compose-settings" ? (
        <ComposeSettingsPopover
          anchorRect={activePopover.anchorRect}
          onClose={closePopover}
          messageEndsTurn={messageEndsTurn}
          onMessageEndsTurnChange={handleMessageEndsTurnChange}
          enterToSend={enterToSend}
          onEnterToSendChange={handleEnterToSendChange}
        />
      ) : null}
      {createTodoAnchorRect !== null ? (
        <CreateTodoPopover
          anchorRect={createTodoAnchorRect}
          onClose={closeCreateTodo}
          endTurnAfter={createTodoEndsTurn}
          onCreated={handleCreateTodoCreated}
        />
      ) : null}
    </div>
  );
}
