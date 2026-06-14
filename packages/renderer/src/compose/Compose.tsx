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
import { createManagedAgentsClient } from "../api/managedAgents.js";
import { useStore } from "../state/store.js";
import { aggregate } from "../state/aggregate.js";
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
import { Bot, FileText, GitFork, Paperclip, Zap, Sparkles, ListChecks, Settings2 } from "lucide-react";
import { ComposeSettingsPopover } from "./ComposeSettingsPopover.js";
import { AgentMentionPicker } from "../components/AgentMentionPicker.js";
import { ForkSessionPopover } from "../components/ForkSessionPopover.js";
import { AttachmentChip, type StagedAttachment } from "./AttachmentChip.js";
import type {
  AccessRequestPayload,
  AccessRequestSuggestion,
  FilePreviewKind,
  ProseMention,
} from "@f-mark/shared";
import { accessRequestOpen, pendingAccessCountForParticipant } from "../cards/AccessRequestCard.js";

const NAMED_SHORTCUT = chordToLabel("$mod+N");
const PRESETS_SHORTCUT = chordToLabel("$mod+P");
const SKILLS_SHORTCUT = chordToLabel("$mod+Shift+K");

function placeholderFor(mode: "message" | "named"): string {
  if (mode === "named") return "Write the contribution content…";
  return `Write a message or ${NAMED_SHORTCUT} to name a contribution…`;
}

function filesFromClipboard(data: DataTransfer): File[] {
  const directFiles = Array.from(data.files ?? []);
  if (directFiles.length > 0) return directFiles;
  return Array.from(data.items ?? [])
    .filter((item) => item.kind === "file")
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null);
}

function accessRequestSuggestions(
  request: AccessRequestPayload,
): AccessRequestSuggestion[] {
  return (request.suggestions ?? []).filter(
    (suggestion): suggestion is AccessRequestSuggestion =>
      suggestion !== null &&
      typeof suggestion === "object" &&
      typeof suggestion.id === "string" &&
      typeof suggestion.label === "string" &&
      (suggestion.decision === "approve" || suggestion.decision === "deny"),
  );
}

export function Compose(): JSX.Element {
  const token = useStore((s) => s.token);
  const sessionId = useStore((s) => s.currentSessionId);
  const sessions = useStore((s) => s.sessions);
  const activePath = useStore((s) => s.activePath);
  const userId = useStore((s) => s.currentUserId);
  const mode = useStore((s) => s.composeMode);
  const setMode = useStore((s) => s.setComposeMode);
  const composeDraft = useStore((s) => s.composeDraft);
  const setComposeDraft = useStore((s) => s.setComposeDraft);
  const participants = useStore((s) => s.participants);
  const events = useStore((s) => s.events);
  const presence = useStore((s) => s.presence);
  const openPopover = useStore((s) => s.openPopover);
  const closePopover = useStore((s) => s.closePopover);
  const activePopover = useStore((s) => s.activePopover);
  const openModal = useStore((s) => s.openModal);
  const requestScrollToBottom = useStore((s) => s.requestScrollToBottom);

  const [content, setContent] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const [attachments, setAttachments] = useState<StagedAttachment[]>([]);
  const [draggingMode, setDraggingMode] = useState<null | "files" | "fmark-path">(null);
  const isDraggingFiles = draggingMode !== null;
  /* DragEnter/Leave fire for every nested descendant. We track a counter
     so the overlay only hides once we've left the outermost target — fixes
     the flicker the old `setIsDraggingFiles(false)` on dragleave caused. */
  const dragCounterRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedMentions, setSelectedMentions] = useState<ProseMention[]>([]);
  const [mentionAnchorRect, setMentionAnchorRect] = useState<DOMRect | null>(null);
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
  const mentionBtnRef = useRef<HTMLButtonElement | null>(null);
  const forkBtnRef = useRef<HTMLButtonElement | null>(null);
  const createTodoBtnRef = useRef<HTMLButtonElement | null>(null);
  const settingsBtnRef = useRef<HTMLButtonElement | null>(null);
  const [createTodoAnchorRect, setCreateTodoAnchorRect] =
    useState<DOMRect | null>(null);
  const [forkAnchorRect, setForkAnchorRect] = useState<DOMRect | null>(null);
  const activeMode: "message" | "named" =
    mode === "named" ? "named" : "message";

  const forkTarget = useMemo(() => {
    if (sessionId === null) return null;
    const found = sessions.find((session) => session.id === sessionId);
    return found ?? {
      id: sessionId,
      slug: sessionId.replace(/^\d{4}-\d{2}-\d{2}-/, ""),
      created_at: new Date().toISOString(),
      ...(activePath !== null ? { path: activePath } : {}),
    };
  }, [activePath, sessionId, sessions]);

  const selectedMentionIds = useMemo(
    () => new Set(selectedMentions.map((mention) => mention.participant_id)),
    [selectedMentions],
  );

  useEffect(() => {
    if (mode === "comment") setMode("message");
  }, [mode, setMode]);

  /* canSubmit accepts either typed content OR staged attachments. Named
     mode still requires a name regardless — naming an attachment-only
     contribution is meaningful (a labeled image). */
  const hasContent = content.trim().length > 0;
  const hasAttachments = attachments.length > 0;
  const hasSendableAttachments = attachments.some(
    (attachment) => !attachment.uploading && !attachment.error,
  );
  const attachmentErrors = useMemo(
    () =>
      attachments.filter(
        (attachment): attachment is StagedAttachment & { error: string } =>
          typeof attachment.error === "string" && attachment.error.length > 0,
      ),
    [attachments],
  );
  const canSubmit = useMemo(() => {
    if (sessionId === null) return false;
    if (userId === null) return false;
    if (!hasContent && !hasSendableAttachments) return false;
    if (activeMode === "named" && name.trim().length === 0) return false;
    return true;
  }, [sessionId, userId, hasContent, hasSendableAttachments, activeMode, name]);

  /* Agent ids bound to the CURRENT session, and whether any of them is
     actually present (online/stale). This is the precise "is there an agent
     in this conversation right now" signal — not a global presence sweep. */
  const sessionAgentIds = useMemo(
    () =>
      Object.entries(participants)
        .filter(([, p]) => p.kind === "agent" && p.active_session === sessionId)
        .map(([id]) => id),
    [participants, sessionId],
  );
  const sessionAgentActive = useMemo(
    () =>
      sessionAgentIds.some((id) => {
        const st = presence[id]?.state;
        return st === "online" || st === "stale";
      }),
    [sessionAgentIds, presence],
  );
  const pendingAccessRequests = useMemo(
    () =>
      events.filter((event) => {
        if (event.kind !== "access-request") return false;
        if (!sessionAgentIds.includes(event.participant_id)) return false;
        return accessRequestOpen(event, events);
      }),
    [events, sessionAgentIds],
  );
  const activeAgentIds = useMemo(
    () =>
      sessionAgentIds.filter((id) => {
        const st = presence[id]?.state;
        return (
          pendingAccessCountForParticipant(id, events) > 0 ||
          st === "online" ||
          st === "stale" ||
          st === "launching"
        );
      }),
    [sessionAgentIds, presence, events],
  );

  /* Whose turn is it? Derived from the last turn-end in the feed (same
     source the TopBar pill uses). Two refinements over the raw default:
       - Agent goes FIRST: before any turn-end exists, a present session
         agent owns the opening turn (it's expected to greet first), so the
         user can't pre-empt with "End turn".
       - When it's the agent's turn the primary action morphs into
         "Stop run" and end-turn is suppressed — it isn't the user's turn.
     We gate on a *present* session agent so a session abandoned mid-turn by
     a disconnected agent (no closing turn-end) doesn't trap the composer —
     the user falls back to the normal compose/end-turn affordance. */
  const derivedTurn = useMemo(
    () => aggregate(events).currentTurnParticipantPrefix,
    [events],
  );
  const hasTurnEnd = useMemo(
    () => events.some((e) => e.kind === "turn-end"),
    [events],
  );
  const effectiveTurn: "us" | "ag" =
    !hasTurnEnd && sessionAgentActive ? "ag" : derivedTurn;
  const isAgentTurn = effectiveTurn === "ag" && sessionAgentActive;

  /* "Stop run" → interrupt every agent bound to the current session. The
     kernel maps {type:"interrupt"} to a C-c into the agent's tmux pane. */
  const interruptSessionAgents = useCallback((): void => {
    if (sessionId === null || sessionAgentIds.length === 0) return;
    const managed = createManagedAgentsClient({ baseUrl: "", token });
    for (const id of sessionAgentIds) {
      void managed.command(id, { type: "interrupt" }).catch(() => {
        /* best-effort: a pane may already be gone; nothing to surface */
      });
    }
  }, [sessionAgentIds, sessionId, token]);

  const respondToFirstPendingApproval = useCallback(
    (decision: "approve" | "deny", optionId?: string): void => {
      const first = pendingAccessRequests[0];
      if (first === undefined || sessionId === null || userId === null) return;
      const request = first.payload as AccessRequestPayload;
      const managed = createManagedAgentsClient({ baseUrl: "", token });
      void managed.respondAccessRequest(first.participant_id, request.request_id, {
        session_id: sessionId,
        participant_id: userId,
        decision,
        ...(optionId !== undefined ? { option_id: optionId } : {}),
      });
    },
    [pendingAccessRequests, sessionId, userId, token],
  );

  const showFirstPendingApproval = useCallback((): void => {
    const first = pendingAccessRequests[0];
    if (first === undefined) return;
    const request = first.payload as AccessRequestPayload;
    const target = document.querySelector<HTMLElement>(
      `[data-access-request-id="${cssEscape(request.request_id)}"]`,
    );
    if (target === null) return;
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    target.classList.add("access-request-card-highlight");
    window.setTimeout(() => {
      target.classList.remove("access-request-card-highlight");
    }, 1200);
  }, [pendingAccessRequests]);

  const pendingApprovalAction = useMemo(() => {
    const first = pendingAccessRequests[0];
    if (first === undefined) return null;
    const request = first.payload as AccessRequestPayload;
    const options = accessRequestSuggestions(request).map((suggestion) => ({
      id: suggestion.id,
      label: suggestion.label,
      decision: suggestion.decision,
    }));
    return {
      requestId: request.request_id,
      participantId: first.participant_id,
      count: pendingAccessRequests.length,
      options,
      onShow: showFirstPendingApproval,
      onApprove: () => respondToFirstPendingApproval("approve"),
      onDeny: () => respondToFirstPendingApproval("deny"),
      onOption: (option: { id: string; decision: "approve" | "deny" }) =>
        respondToFirstPendingApproval(option.decision, option.id),
    };
  }, [
    pendingAccessRequests,
    respondToFirstPendingApproval,
    showFirstPendingApproval,
  ]);

  const submit = useCallback(async (): Promise<void> => {
    if (!canSubmit || sessionId === null || userId === null) return;
    setBusy(true);
    try {
      const client = createClient({ baseUrl: "", token });
      const managedClient = createManagedAgentsClient({ baseUrl: "", token });
      const mentions = selectedMentions;

      /* Send order: prose first (to get a filename for append_to), then
         each file event referencing that prose. Attachments-only sends
         skip the prose step and post standalone file events. F-Mark is
         append-only — if a file POST fails mid-loop, the prose is still
         in the feed; the failed chip stays in error state for retry. */
      let proseFilename: string | undefined = undefined;
      if (hasContent) {
        const body: {
          participant_id: string;
          content: string;
          name?: string;
          mentions?: ProseMention[];
        } = { participant_id: userId, content };
        if (activeMode === "named") body.name = name.trim();
        if (mentions.length > 0) body.mentions = mentions;
        const proseResponse = await client.postProse(sessionId, body);
        proseFilename = proseResponse.filename;
      }

      const sendable = attachments.filter((a) => !a.uploading && !a.error);
      for (const att of sendable) {
        await client.postFile(sessionId, {
          participant_id: userId,
          id: att.id,
          path: att.path,
          mime_type: att.mimeType,
          display_name: att.displayName,
          size_bytes: att.sizeBytes,
          preview_kind: att.previewKind,
          ...(proseFilename !== undefined ? { append_to: proseFilename } : {}),
        });
      }

      /* Wake gating (unchanged for prose-only; attachments-only sends
         behave like a user message for wake purposes). */
      if (activeMode === "message") {
        if (mentions.length > 0) {
          await managedClient.wakeSession(sessionId, {
            reason: "mention",
            target_participant_ids: mentions.map((m) => m.participant_id),
          });
        } else if (messageEndsTurn) {
          await managedClient.wakeSession(sessionId, {
            reason: "user-message",
          });
        }
      }

      setContent("");
      setSelectedMentions([]);
      if (activeMode === "named") setName("");
      for (const att of sendable) {
        if (att.previewUrl !== null) URL.revokeObjectURL(att.previewUrl);
      }
      const sentIds = new Set(sendable.map((a) => a.id));
      setAttachments((prev) => prev.filter((a) => !sentIds.has(a.id)));
      requestScrollToBottom();
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
    hasContent,
    name,
    selectedMentions,
    messageEndsTurn,
    attachments,
    requestScrollToBottom,
  ]);

  const endTurn = useCallback(async (): Promise<boolean> => {
    if (sessionId === null || userId === null) return false;
    const client = createClient({ baseUrl: "", token });
    await client.postTurnEnd(sessionId, userId);
    return true;
  }, [sessionId, userId, token]);

  /* End-turn-and-wake: the canonical user-initiated end-of-turn path.
     Both the keyboard hotkey (`Cmd/Ctrl+Enter` on empty content) and the
     SendButton's End-Turn click route through here so the wake fires for
     both. The wake only happens when `endTurn()` actually posted — if it
     short-circuited (no session/user) we don't fabricate a wake. */
  const endTurnAndWake = useCallback(async (): Promise<void> => {
    const posted = await endTurn();
    if (!posted || sessionId === null) return;
    const managedClient = createManagedAgentsClient({ baseUrl: "", token });
    await managedClient.wakeSession(sessionId, { reason: "user-message" });
  }, [endTurn, sessionId, token]);

  /* The Send action: submit, then (when in message mode with the
     ends-turn toggle on) end the turn. We chain so the prose event is
     persisted before the turn-end event — out-of-order would write a
     turn-end before its contribution. `submit()` already fired the wake
     for both the mention and no-mention cases (gated on
     `messageEndsTurn`); calling bare `endTurn()` here avoids a second
     broad wake on top of submit's first wake. */
  const submitAndMaybeEndTurn = useCallback(async (): Promise<void> => {
    await submit();
    if (activeMode === "message" && messageEndsTurn) {
      await endTurn();
    }
  }, [submit, endTurn, activeMode, messageEndsTurn]);

  const sendOrEndTurn = useCallback(async (): Promise<void> => {
    if (activeMode === "message" && !canSubmit) {
      await endTurnAndWake();
      return;
    }
    await submitAndMaybeEndTurn();
  }, [activeMode, canSubmit, endTurnAndWake, submitAndMaybeEndTurn]);

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
    setForkAnchorRect(null);
  }, [closePopover]);

  const openFork = useCallback((): void => {
    if (sessionId === null) return;
    const rect = forkBtnRef.current?.getBoundingClientRect() ?? null;
    closePopover();
    setCreateTodoAnchorRect(null);
    setForkAnchorRect(rect);
  }, [closePopover, sessionId]);

  const openMentions = useCallback((): void => {
    const rect =
      mentionBtnRef.current?.getBoundingClientRect() ??
      textareaRef.current?.getBoundingClientRect() ??
      null;
    closePopover();
    setCreateTodoAnchorRect(null);
    setMentionAnchorRect(rect);
  }, [closePopover]);

  const closeMentions = useCallback((): void => {
    setMentionAnchorRect(null);
  }, []);

  const addMention = useCallback((mention: ProseMention): void => {
    if (selectedMentionIds.has(mention.participant_id)) {
      setMentionAnchorRect(null);
      queueMicrotask(() => textareaRef.current?.focus());
      return;
    }
    setSelectedMentions((prev) => [...prev, mention]);
    setContent((prev) => {
      const needsSpace = prev.length > 0 && !/\s$/.test(prev);
      return `${prev}${needsSpace ? " " : ""}${mention.token} `;
    });
    setMentionAnchorRect(null);
    queueMicrotask(() => textareaRef.current?.focus());
  }, [selectedMentionIds]);

  const closeCreateTodo = useCallback((): void => {
    setCreateTodoAnchorRect(null);
  }, []);

  const closeFork = useCallback((): void => {
    setForkAnchorRect(null);
  }, []);

  const createTodoEndsTurn = activeMode === "message" && messageEndsTurn;

  const handleCreateTodoCreated = useCallback(async (): Promise<void> => {
    if (createTodoEndsTurn) {
      await endTurn();
    }
  }, [createTodoEndsTurn, endTurn]);

  /* stageFiles — upload each file to /attachments (no event yet), then
     add a chip to local state. Image chips get an objectURL preview from
     the source File so the thumbnail renders immediately, even before
     the upload finishes. */
  const stageFiles = useCallback(
    async (files: File[]): Promise<void> => {
      if (files.length === 0 || sessionId === null) return;
      const client = createClient({ baseUrl: "", token });
      setAttachmentBusy(true);
      try {
        for (const file of files) {
          const previewUrl = file.type.startsWith("image/")
            ? URL.createObjectURL(file)
            : null;
          /* Temporary placeholder until the upload returns the real id.
             We can't show in-flight progress through the chip array
             without a stable key, so we reserve the slot with a UUID
             that's swapped for the server id on completion. */
          const tempId = `tmp_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
          const placeholder: StagedAttachment = {
            id: tempId,
            displayName: file.name || "pasted-file",
            mimeType: file.type || "application/octet-stream",
            sizeBytes: file.size,
            path: "",
            previewKind: (file.type.startsWith("image/")
              ? "image"
              : "file") as FilePreviewKind,
            uploading: true,
            previewUrl,
          };
          setAttachments((prev) => [...prev, placeholder]);
          try {
            const meta = await client.uploadAttachment(sessionId, {
              file,
              display_name: file.name || undefined,
              /* The current kernel ignores participant_id on the
                 upload-only endpoint, but pre-v0.5 kernels still require
                 it. Send it when we have a user so the renderer works
                 against both. */
              ...(userId !== null ? { participant_id: userId } : {}),
            });
            setAttachments((prev) =>
              prev.map((a) =>
                a.id === tempId
                  ? {
                      ...a,
                      id: meta.id,
                      displayName: meta.display_name,
                      mimeType: meta.mime_type,
                      sizeBytes: meta.size_bytes,
                      path: meta.path,
                      previewKind: meta.preview_kind,
                      uploading: false,
                    }
                  : a,
              ),
            );
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            setAttachments((prev) =>
              prev.map((a) =>
                a.id === tempId ? { ...a, uploading: false, error: msg } : a,
              ),
            );
          }
        }
      } finally {
        setAttachmentBusy(false);
      }
    },
    [sessionId, token, userId],
  );

  const removeAttachment = useCallback(
    (id: string): void => {
      if (sessionId === null) return;
      const target = attachments.find((a) => a.id === id);
      if (target === undefined) return;
      if (target.previewUrl !== null) URL.revokeObjectURL(target.previewUrl);
      setAttachments((prev) => prev.filter((a) => a.id !== id));
      /* If we never received the server id (upload failed or in flight)
         skip the DELETE — there's nothing on disk yet, or we don't know
         what to delete. */
      if (target.uploading || target.error || id.startsWith("tmp_")) return;
      const client = createClient({ baseUrl: "", token });
      void client
        .deleteAttachment(sessionId, id)
        .catch((err: unknown) =>
          console.error("Attachment delete failed", err),
        );
    },
    [attachments, sessionId, token],
  );

  const handleTextareaPaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>): void => {
      const files = filesFromClipboard(e.clipboardData);
      if (files.length === 0) return;
      e.preventDefault();
      void stageFiles(files).catch((err: unknown) => {
        console.error("Attachment upload failed", err);
      });
    },
    [stageFiles],
  );

  const handleAttachClick = useCallback((): void => {
    fileInputRef.current?.click();
  }, []);

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>): void => {
      const files = Array.from(e.target.files ?? []);
      e.target.value = "";
      if (files.length === 0) return;
      void stageFiles(files).catch((err: unknown) => {
        console.error("Attachment upload failed", err);
      });
    },
    [stageFiles],
  );

  /* Drag-over the compose region. We track a counter because dragenter
     fires on every descendant; without it the overlay flickers as the
     pointer crosses internal boundaries. Two recognized payloads:
       - "Files" → OS file drop, runs the existing upload-and-stage path.
       - "application/x-fmark-file-path" → in-app drag from the Files
         pane, pastes the absolute path inline into the textarea. */
  const detectDragMode = (
    e: React.DragEvent<HTMLDivElement>,
  ): "files" | "fmark-path" | null => {
    const types = Array.from(e.dataTransfer.types);
    if (types.includes("application/x-fmark-file-path")) return "fmark-path";
    if (types.includes("Files")) return "files";
    return null;
  };

  const handleDragEnter = useCallback(
    (e: React.DragEvent<HTMLDivElement>): void => {
      const mode = detectDragMode(e);
      if (mode === null) return;
      e.preventDefault();
      dragCounterRef.current += 1;
      setDraggingMode(mode);
    },
    [],
  );

  const handleDragLeave = useCallback(
    (e: React.DragEvent<HTMLDivElement>): void => {
      const mode = detectDragMode(e);
      if (mode === null) return;
      dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
      if (dragCounterRef.current === 0) setDraggingMode(null);
    },
    [],
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>): void => {
      const mode = detectDragMode(e);
      if (mode === null) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    },
    [],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>): void => {
      const mode = detectDragMode(e);
      if (mode === null) return;
      e.preventDefault();
      dragCounterRef.current = 0;
      setDraggingMode(null);
      if (mode === "fmark-path") {
        const path = e.dataTransfer.getData("application/x-fmark-file-path");
        if (path.length === 0) return;
        setContent((prev) =>
          prev.length === 0
            ? path
            : /\s$/.test(prev)
              ? `${prev}${path}`
              : `${prev} ${path}`,
        );
        queueMicrotask(() => textareaRef.current?.focus());
        return;
      }
      const files = Array.from(e.dataTransfer.files);
      if (files.length === 0) return;
      void stageFiles(files).catch((err: unknown) => {
        console.error("Attachment upload failed", err);
      });
    },
    [stageFiles],
  );

  /* Switching sessions clears any staged chips; bytes on disk become
     orphans (acceptable per spec). Object URLs revoked here to release
     blob memory. */
  useEffect(() => {
    setAttachments((prev) => {
      for (const att of prev) {
        if (att.previewUrl !== null) URL.revokeObjectURL(att.previewUrl);
      }
      return [];
    });
  }, [sessionId]);

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
    <div
      className={`compose-inner${isDraggingFiles ? " is-dragging-files" : ""}`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {(content.length > 0 || activeMode === "named") && (
        <NameChip
          active={activeMode === "named"}
          value={name}
          onChange={setName}
          onActivate={() => setMode("named")}
          onCancel={onCancelName}
        />
      )}
      {hasAttachments ? (
        <div className="compose-attachments" role="list">
          {attachments.map((att) => (
            <AttachmentChip
              key={att.id}
              attachment={att}
              onRemove={removeAttachment}
            />
          ))}
        </div>
      ) : null}
      {attachmentErrors.length > 0 ? (
        <div
          className="compose-attachment-errors"
          role="alert"
          aria-live="polite"
        >
          {attachmentErrors.map((attachment) => (
            <div className="compose-attachment-error" key={attachment.id}>
              <span className="compose-attachment-error-name">
                {attachment.displayName}
              </span>
              <span className="compose-attachment-error-message">
                {attachment.error}
              </span>
            </div>
          ))}
        </div>
      ) : null}
      <div className="compose-box">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => {
            setContent(e.target.value);
            if (e.target.value.endsWith("@")) openMentions();
          }}
          onKeyDown={onTextareaKey}
          onPaste={handleTextareaPaste}
          placeholder={placeholderFor(activeMode)}
          rows={activeMode === "named" ? 4 : 1}
          aria-label="Compose message"
        />
        <input
          ref={fileInputRef}
          type="file"
          multiple
          hidden
          onChange={handleFileInputChange}
          aria-hidden
          tabIndex={-1}
        />
        <div className="compose-actions">
          {/* Row 1 — primary stage: the morphing primary action, centered.
              The Name-it affordance now lives as a chip above the textarea. */}
          <div className="compose-actions-row compose-actions-primary">
            <SendButton
              mode={activeMode}
              canSubmit={canSubmit}
              busy={busy || attachmentBusy}
              hasContent={hasContent || hasSendableAttachments}
              isAgentTurn={isAgentTurn}
              activeAgentCount={activeAgentIds.length}
              pendingApproval={pendingApprovalAction}
              onSubmit={() => void submitAndMaybeEndTurn()}
              onEndTurn={() => void endTurnAndWake()}
              onInterrupt={interruptSessionAgents}
            />
          </div>

          {/* Row 2 — augment launchers (Presets · Skills · Task) on the left,
              compose-settings toggle on the right (space-between). */}
          <div className="compose-actions-row compose-actions-secondary">
            <div className="compose-zone compose-zone-augments">
              <button
                ref={mentionBtnRef}
                type="button"
                className="mode-btn"
                onClick={openMentions}
                aria-label="Mention agent"
                title="Mention agent"
              >
                <Bot size={14} aria-hidden />
                <span className="dock-label">Agent</span>
              </button>
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
              <button
                type="button"
                className="mode-btn"
                onClick={handleAttachClick}
                aria-label="Attach a file"
                title="Attach a file"
                disabled={sessionId === null}
              >
                <Paperclip size={14} aria-hidden />
                <span className="dock-label">Attach</span>
              </button>
            </div>
            <div className="compose-zone compose-zone-end">
              <button
                ref={forkBtnRef}
                type="button"
                className="mode-btn"
                onClick={openFork}
                aria-label="Fork current session"
                title="Fork session"
                disabled={sessionId === null}
              >
                <GitFork size={14} aria-hidden />
                <span className="dock-label">Fork</span>
              </button>
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
      </div>
      {activePopover.key === "presets" ? (
        <PresetsPopover
          anchorRect={activePopover.anchorRect}
          onClose={closePopover}
        />
      ) : null}
      {mentionAnchorRect !== null ? (
        <AgentMentionPicker
          anchorRect={mentionAnchorRect}
          sessionId={sessionId}
          token={token}
          participants={participants}
          selectedIds={selectedMentionIds}
          onSelect={addMention}
          onClose={closeMentions}
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
      {forkAnchorRect !== null && forkTarget !== null ? (
        <ForkSessionPopover
          anchorRect={forkAnchorRect}
          target={forkTarget}
          onClose={closeFork}
        />
      ) : null}
      {draggingMode !== null ? (
        <div className="compose-drag-overlay" aria-hidden>
          {draggingMode === "fmark-path" ? (
            <FileText size={20} aria-hidden />
          ) : (
            <Paperclip size={20} aria-hidden />
          )}
          <span>
            {draggingMode === "fmark-path"
              ? "Drop to paste path"
              : "Drop to attach"}
          </span>
        </div>
      ) : null}
    </div>
  );
}

function cssEscape(s: string): string {
  const esc = (globalThis as { CSS?: { escape?: (v: string) => string } }).CSS
    ?.escape;
  return typeof esc === "function" ? esc(s) : s.replace(/"/g, '\\"');
}
