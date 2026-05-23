/* Compose — the real compose bar.
   Mirrors design.html `.compose .compose-inner …` and the prototype in
   planning/redesign/panels.jsx (ComposeBar). Replaces the legacy
   components/Composer.tsx.

   Modes (from store.composeMode):
     - message  → POST prose { participant_id, content }
     - named    → POST prose { participant_id, content, name }
     - comment  → POST prose { participant_id, content, target }, clears target

   Hotkeys (via useHotkeys):
     - $mod+/    → toggle comment (only if a target is set; otherwise toggle Message)
     - $mod+n    → toggle named
     - $mod+p    → open the ⚡ Presets popover anchored at the presets button
     - $mod+enter→ submit the active mode
     - escape    → clear commentTarget if set; else blur textarea
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
import { ModeBar } from "./ModeBar.js";
import { NameInput } from "./NameInput.js";
import { TargetPill } from "./TargetPill.js";
import { SendButton } from "./SendButton.js";
import { CreateTodoPopover } from "./CreateTodoPopover.js";
import { PresetsPopover } from "../popovers/PresetsPopover.js";
import { Zap, Sparkles, Link2, Unlink2, ListChecks, Settings2 } from "lucide-react";
import { ComposeSettingsPopover } from "./ComposeSettingsPopover.js";

const NAMED_SHORTCUT = chordToLabel("$mod+N");
const PRESETS_SHORTCUT = chordToLabel("$mod+P");
const SKILLS_SHORTCUT = chordToLabel("$mod+Shift+K");

function placeholderFor(
  mode: "message" | "named" | "comment",
  hasTarget: boolean,
): string {
  if (mode === "comment" || hasTarget) return "Write your comment…";
  if (mode === "named") return "Write the contribution content…";
  return `Write a message or ${NAMED_SHORTCUT} to name a contribution…`;
}

export function Compose(): JSX.Element {
  const token = useStore((s) => s.token);
  const sessionId = useStore((s) => s.currentSessionId);
  const userId = useStore((s) => s.currentUserId);
  const mode = useStore((s) => s.composeMode);
  const setMode = useStore((s) => s.setComposeMode);
  const commentTarget = useStore((s) => s.commentTarget);
  const setCommentTarget = useStore((s) => s.setCommentTarget);
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

  // canSubmit mirrors legacy Composer.
  const canSubmit = useMemo(() => {
    if (sessionId === null) return false;
    if (userId === null) return false;
    if (content.trim().length === 0) return false;
    if (mode === "named" && name.trim().length === 0) return false;
    if (mode === "comment" && commentTarget === null) return false;
    return true;
  }, [sessionId, userId, content, mode, name, commentTarget]);

  const submit = useCallback(async (): Promise<void> => {
    if (!canSubmit || sessionId === null || userId === null) return;
    setBusy(true);
    try {
      const client = createClient({ baseUrl: "", token });
      const body: {
        participant_id: string;
        content: string;
        name?: string;
        target?: { file: string; lines?: [number, number] };
      } = { participant_id: userId, content };
      if (mode === "named") body.name = name.trim();
      if (mode === "comment" && commentTarget !== null) {
        body.target = commentTarget;
      }
      await client.postProse(sessionId, body);
      setContent("");
      if (mode === "named") setName("");
      if (mode === "comment") setCommentTarget(null);
    } finally {
      setBusy(false);
    }
  }, [
    canSubmit,
    sessionId,
    userId,
    token,
    mode,
    content,
    name,
    commentTarget,
    setCommentTarget,
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
    if (mode === "message" && messageEndsTurn) {
      await endTurn();
    }
  }, [submit, endTurn, mode, messageEndsTurn]);

  const sendOrEndTurn = useCallback(async (): Promise<void> => {
    if (mode === "message" && !canSubmit) {
      await endTurn();
      return;
    }
    await submitAndMaybeEndTurn();
  }, [mode, canSubmit, endTurn, submitAndMaybeEndTurn]);

  /* openPresets — anchor the presets popover under the ⚡ button. Called
     by the button click handler and by the $mod+P hotkey. Reads the current
     button's bounding rect at the moment of invocation (the ref may not
     have settled at memo-construction time). */
  const openPresets = useCallback((): void => {
    const rect = presetsBtnRef.current?.getBoundingClientRect() ?? null;
    setCreateTodoAnchorRect(null);
    openPopover("presets", rect);
  }, [openPopover]);

  const openSettings = useCallback((): void => {
    const rect = settingsBtnRef.current?.getBoundingClientRect() ?? null;
    setCreateTodoAnchorRect(null);
    openPopover("compose-settings", rect);
  }, [openPopover]);

  const openCreateTodo = useCallback((): void => {
    const rect = createTodoBtnRef.current?.getBoundingClientRect() ?? null;
    closePopover();
    setCreateTodoAnchorRect(rect);
  }, [closePopover]);

  const closeCreateTodo = useCallback((): void => {
    setCreateTodoAnchorRect(null);
  }, []);

  const createTodoEndsTurn = mode === "message" && messageEndsTurn;

  const handleCreateTodoCreated = useCallback(async (): Promise<void> => {
    if (createTodoEndsTurn) {
      await endTurn();
    }
  }, [createTodoEndsTurn, endTurn]);

  const handleEscape = useCallback((): boolean => {
    if (commentTarget !== null) {
      setCommentTarget(null);
      return true;
    }
    if (
      textareaRef.current !== null &&
      document.activeElement === textareaRef.current
    ) {
      textareaRef.current.blur();
      return true;
    }
    return false;
  }, [commentTarget, setCommentTarget]);

  // Hotkey map — stable per-render via dependency-aware memo.
  const hotkeyMap = useMemo<HotkeyMap>(
    () => ({
      "$mod+/": () => {
        // Per spec: toggle comment mode if a target is set; otherwise force
        // back to Message (you can't comment without a target).
        if (commentTarget !== null) {
          setMode(mode === "comment" ? "message" : "comment");
        } else {
          setMode("message");
        }
      },
      "$mod+n": () => {
        setMode(mode === "named" ? "message" : "named");
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
      mode,
      commentTarget,
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

  // When commentTarget appears, the store also sets mode='comment' (see
  // store.setCommentTarget). When it's cleared by escape we leave mode alone;
  // it will return to 'message' on next composeMode update by ModeBar.

  // Auto-grow the textarea up to its max-height (140px from CSS).

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

  return (
    <div className="compose-inner">
      {commentTarget !== null && (
        <TargetPill
          target={commentTarget}
          onClose={() => setCommentTarget(null)}
        />
      )}
      {mode === "named" && (
        <NameInput value={name} onChange={setName} />
      )}
      <div className="compose-box">
        <div className="textarea-wrapper" data-replicated-value={content}>
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={onTextareaKey}
            placeholder={placeholderFor(mode, commentTarget !== null)}
            rows={mode === "named" ? 4 : 1}
            aria-label="Compose message"
          />
        </div>
        <div className="compose-actions">
          {/* Zone 1 — mode setters (Name it · Comment). */}
          <div className="compose-zone compose-zone-modes">
            <ModeBar />
          </div>
          
          <div className="dock-divider" />

          {/* Zone 2 — augment launchers (Presets · Skills). */}
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

          <div className="dock-spacer" />

          {/* Zone 3 — primary action: optional ends-turn chip + Send cluster. */}
          <div className="compose-zone compose-zone-act">
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
            <SendButton
              mode={mode}
              canSubmit={canSubmit}
              busy={busy}
              hasContent={content.trim().length > 0}
              onSubmit={() => void submitAndMaybeEndTurn()}
              onEndTurn={() => void endTurn()}
            />
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
