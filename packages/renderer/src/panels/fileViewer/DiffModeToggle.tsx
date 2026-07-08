const NO_LOOSE_STRING_VALUES = {
  wholeBranch: "whole-branch",
  none: "none",
  notGit: "not-git",
  gitDiff: "git-diff",
} as const;

/* Diff-mode control for the FileViewer chrome (design §8.3). Sits next to the
   LayoutToggle. Mode: none / current-session (default) / whole-branch. The
   inline/side-by-side STYLE toggle is a separate icon control beside this one
   (DiffStyleToggle) — it is no longer nested in this dropdown. Per-tab state
   lives in the store (fileViewerDiffBySession), so it survives the renderer
   remount on file switch but resets on reload. A gear opens the Git/Diff
   settings section. */

import { useCallback, useEffect, useRef, useState } from "react";
import { GitCompareArrows, ChevronDown, Settings2 } from "lucide-react";
import type { GitBranchRefsResponse } from "@f-mark/shared";
import { createClient } from "../../api/client.js";
import { useFileScope } from "./fileScope.js";
import {
  useStore,
  DEFAULT_FILE_VIEWER_DIFF,
  type FileViewerDiffMode,
} from "../../state/store.js";

const MODES: { key: FileViewerDiffMode; label: string; hint: string }[] = [
  { key: "none", label: "No diff", hint: "Show the plain file" },
  {
    key: "current-session",
    label: "Session changes",
    hint: "Diff this session's touched files (default)",
  },
  {
    key: "whole-branch",
    label: "Whole branch",
    hint: "Diff every change since the merge-base",
  },
];

function defaultBranchBaseRef(refs: GitBranchRefsResponse | null): string {
  return refs?.current_ref ?? refs?.detected_base_ref ?? "HEAD";
}

function branchOptions(refs: GitBranchRefsResponse | null): string[] {
  const seen = new Set<string>();
  for (const raw of [
    refs?.current_ref,
    "HEAD",
    refs?.detected_base_ref,
    ...(refs?.refs ?? []),
  ]) {
    if (raw === undefined || raw === null) continue;
    const ref = raw.trim();
    if (ref.length > 0) seen.add(ref);
  }
  return [...seen];
}

export interface DiffModeToggleProps {
  /** The standalone /file-tree tab passes its in-memory session namespace. */
  sessionKey?: string;
  /** When the active root is not a git worktree, disable diff modes. */
  disabled?: boolean;
}

export function DiffModeToggle({
  sessionKey,
  disabled = false,
}: DiffModeToggleProps): JSX.Element | null {
  const sid = useStore((s) => s.currentSessionId);
  const key = sessionKey ?? sid;
  const activePath = useStore((s) =>
    sessionKey !== undefined
      ? (s.fileViewerActiveBySession[sessionKey] ?? null)
      : s.currentSessionId !== null
        ? (s.fileViewerActiveBySession[s.currentSessionId] ?? null)
        : null,
  );
  const diff = useStore((s) =>
    key !== null && activePath !== null
      ? (s.fileViewerDiffBySession[key]?.[activePath] ??
        DEFAULT_FILE_VIEWER_DIFF)
      : DEFAULT_FILE_VIEWER_DIFF,
  );
  const setDiff = useStore((s) => s.setFileViewerDiff);
  const openSettings = useStore((s) => s.openSettings);
  const token = useStore((s) => s.token);
  const fileScope = useFileScope();
  const [open, setOpen] = useState(false);
  const [refs, setRefs] = useState<GitBranchRefsResponse | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent): void {
      if (!(e.target instanceof Node)) return;
      if (popRef.current?.contains(e.target)) return;
      if (btnRef.current?.contains(e.target)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") setOpen(false);
    }
    const id = window.setTimeout(
      () => window.addEventListener("mousedown", onDown),
      0,
    );
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open || fileScope.scope === null) return;
    let cancelled = false;
    const client = createClient({ baseUrl: "", token });
    client
      .gitBranchRefs(fileScope.scope)
      .then((response) => {
        if (!cancelled) setRefs(response);
      })
      .catch(() => {
        if (!cancelled) setRefs(null);
      });
    return () => {
      cancelled = true;
    };
  }, [fileScope.scope, open, token]);

  const setMode = useCallback(
    (mode: FileViewerDiffMode) => {
      if (activePath === null) return;
      const patch =
        mode === NO_LOOSE_STRING_VALUES.wholeBranch
          ? { mode, baseRef: diff.baseRef ?? defaultBranchBaseRef(refs) }
          : { mode, baseRef: null };
      setDiff(activePath, patch, sessionKey);
    },
    [activePath, diff.baseRef, refs, setDiff, sessionKey],
  );

  if (activePath === null) return null;

  const current = MODES.find((m) => m.key === diff.mode) ?? MODES[1]!;
  const isOn = diff.mode !== NO_LOOSE_STRING_VALUES.none;

  return (
    <div className="fv-diff-toggle">
      <button
        ref={btnRef}
        type="button"
        className={`fv-layout-btn ${isOn ? "is-on" : ""}`}
        onClick={() => setOpen((v) => !v)}
        title={disabled ? "Not a git repository" : `Diff: ${current.label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        data-testid="diff-mode-button"
      >
        <GitCompareArrows size={13} aria-hidden />
        <ChevronDown size={10} aria-hidden className="fv-layout-caret" />
      </button>
      {open ? (
        <div ref={popRef} className="fv-layout-pop" role="menu">
          {MODES.map((m) => (
            <button
              key={m.key}
              type="button"
              role="menuitemradio"
              aria-checked={m.key === diff.mode}
              className={`fv-layout-pop-item ${m.key === diff.mode ? "is-current" : ""}`}
              onClick={() => setMode(m.key)}
              data-testid={`diff-mode-${m.key}`}
            >
              <span className="fv-layout-pop-label">{m.label}</span>
              <span className="fv-layout-pop-hint">{m.hint}</span>
            </button>
          ))}
          {diff.mode === NO_LOOSE_STRING_VALUES.wholeBranch ? (
            <label className="fv-layout-pop-select">
              <span className="fv-layout-pop-label">Compare branch</span>
              <select
                value={diff.baseRef ?? defaultBranchBaseRef(refs)}
                onChange={(event) => {
                  if (activePath === null) return;
                  setDiff(
                    activePath,
                    { mode: NO_LOOSE_STRING_VALUES.wholeBranch, baseRef: event.currentTarget.value },
                    sessionKey,
                  );
                }}
                disabled={disabled || refs?.status === NO_LOOSE_STRING_VALUES.notGit}
              >
                {branchOptions(refs).map((ref) => (
                  <option key={ref} value={ref}>
                    {ref}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <button
            type="button"
            role="menuitem"
            className="fv-layout-pop-item fv-diff-settings-link"
            onClick={() => {
              setOpen(false);
              openSettings(NO_LOOSE_STRING_VALUES.gitDiff);
            }}
            data-testid="diff-settings-gear"
          >
            <Settings2 size={13} aria-hidden className="fv-layout-pop-icon" />
            <span className="fv-layout-pop-label">Git/Diff settings…</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
