import { useCallback } from "react";
import { useStore } from "../../../state/store.js";
import { useDiffState } from "../diff/useDiffState.js";
import { useDiffOutcome } from "../diff/useDiffOutcome.js";
import { extOf, pickRenderer } from "../renderers/pickRenderer.js";
import { isTextRendererKind, type FileViewerModel } from "./model.js";
import { useGitDiffAvailability } from "./useGitDiffAvailability.js";

export function useFileViewerController(): FileViewerModel {
  const sessionId = useStore((s) => s.currentSessionId);
  const active = useStore((s) =>
    sessionId !== null
      ? (s.fileViewerActiveBySession[sessionId] ?? null)
      : null,
  );
  const setModalOpen = useStore((s) => s.setFileViewerModalOpen);
  const diffState = useDiffState(active ?? "");
  const kind = active !== null ? pickRenderer(extOf(active)) : null;
  const outcome = useDiffOutcome(
    active,
    diffState.active ? diffState.wireMode : null,
    sessionId,
    diffState.baseRef,
  );
  const notGit = useGitDiffAvailability();
  const openModal = useCallback(() => setModalOpen(true), [setModalOpen]);

  return {
    active,
    kind,
    sessionId,
    diffState,
    outcome,
    notGit,
    isTextKind: isTextRendererKind(kind),
    openModal,
  };
}
