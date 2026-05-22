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

import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from "react";
import { createClient } from "../api/client.js";
import { useStore } from "../state/store.js";
import { useHotkeys, type HotkeyMap } from "../hooks/useHotkeys.js";
import { ModeBar } from "./ModeBar.js";
import { NameInput } from "./NameInput.js";
import { TargetPill } from "./TargetPill.js";
import { SendButton } from "./SendButton.js";
import { PresetsPopover } from "../popovers/PresetsPopover.js";
import { Zap, Sparkles } from "lucide-react";

function placeholderFor(
  mode: "message" | "named" | "comment",
  hasTarget: boolean,
): string {
  if (mode === "comment" || hasTarget) return "Write your comment…";
  if (mode === "named") return "Write the contribution content…";
  return "Write a message or ⌘N to name a contribution…";
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

  const [content, setContent] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const presetsBtnRef = useRef<HTMLButtonElement | null>(null);

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

  /* openPresets — anchor the presets popover under the ⚡ button. Called
     by the button click handler and by the ⌘P hotkey. Reads the current
     button's bounding rect at the moment of invocation (the ref may not
     have settled at memo-construction time). */
  const openPresets = useCallback((): void => {
    const rect = presetsBtnRef.current?.getBoundingClientRect() ?? null;
    openPopover("presets", rect);
  }, [openPopover]);

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
      "$mod+enter": () => {
        void submit();
      },
      escape: (e) => {
        if (commentTarget !== null) {
          setCommentTarget(null);
          return;
        }
        // Else: blur the textarea if it's focused; otherwise let the event
        // bubble (return false to opt out of preventDefault).
        if (
          textareaRef.current !== null &&
          document.activeElement === textareaRef.current
        ) {
          textareaRef.current.blur();
          return;
        }
        return false;
      },
    }),
    [mode, commentTarget, setMode, setCommentTarget, submit, openPresets],
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
  useEffect(() => {
    const ta = textareaRef.current;
    if (ta === null) return;
    ta.style.height = "auto";
    const next = Math.min(ta.scrollHeight, 140);
    ta.style.height = `${next}px`;
  }, [content, mode]);

  function onTextareaKey(e: React.KeyboardEvent<HTMLTextAreaElement>): void {
    // Enter (no shift/meta) → submit in single-line message mode? The
    // prototype uses ⌘↵ universally and Enter inserts a newline. So we keep
    // Enter as newline and rely on the global useHotkeys for ⌘↵. We still
    // stopPropagation on plain Enter so it never escapes to other handlers.
    if (e.key === "Enter" && !e.shiftKey && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void submit();
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
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={onTextareaKey}
          placeholder={placeholderFor(mode, commentTarget !== null)}
          rows={mode === "named" ? 4 : 2}
          aria-label="Compose message"
        />
        <div className="compose-actions">
          <ModeBar />
          <button
            ref={presetsBtnRef}
            type="button"
            className="mode-btn"
            onClick={openPresets}
            aria-label="Open presets"
            title="Open presets (⌘P)"
          >
            <Zap size={11} aria-hidden />
            Presets <span className="kbd">⌘P</span>
          </button>
          <button
            type="button"
            className="mode-btn"
            disabled
            title="Coming in P9"
            aria-label="Skills (coming in P9)"
          >
            <Sparkles size={11} aria-hidden />
            Skills <span className="kbd">⌘⇧K</span>
          </button>
          <SendButton
            mode={mode}
            canSubmit={canSubmit}
            busy={busy}
            hasContent={content.trim().length > 0}
            onSubmit={() => void submit()}
            onEndTurn={() => void endTurn()}
          />
        </div>
      </div>
      {activePopover.key === "presets" ? (
        <PresetsPopover
          anchorRect={activePopover.anchorRect}
          onClose={closePopover}
        />
      ) : null}
    </div>
  );
}
