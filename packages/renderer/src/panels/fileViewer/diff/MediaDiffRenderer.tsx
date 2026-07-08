/* Before/after media diff for image/audio/video (design §8 / X6). Streams the
   base and working blobs from GET /git/blob-version. Shows both sides for a
   modified file; only the working side for added/untracked; only the base side
   for deleted. Images expose natural dimensions + byte size; av players show
   when both versions exist. Never crashes on an edge state. */

import { useEffect, useMemo, useState } from "react";
import { createClient } from "../../../api/client.js";
import { useStore } from "../../../state/store.js";
import { useScopedFile } from "../fileScope.js";
import { basenameOf } from "../renderers/pickRenderer.js";
import { GIT_FILE_STATUSES, actionsForStatus } from "@f-mark/shared";
import type { DiffBase, GitDiffMode, GitDiffResponse } from "@f-mark/shared";
import { HunkActionsBar } from "./HunkActionsBar.js";
import { wireModeToDiffBase } from "./diffBase.js";

export type MediaKind = "image" | "audio" | "video";

export interface MediaDiffRendererProps {
  path: string;
  kind: MediaKind;
  /** Server diff resolved by the FileViewer (useDiffOutcome). */
  diff: GitDiffResponse;
  wireMode: GitDiffMode;
  baseRef: string | null;
  sessionId: string | null;
  /** Bumped on revert — cache-busts the <img>/<video> so it reloads the new
      working bytes (the rel_path/scope are unchanged). */
  refreshKey: number;
  /** Called after a successful revert so the shared diff re-fetches. */
  onReverted: () => void;
}

const mediaKinds = {
  image: "image",
  video: "video",
} as const;

const blobVersions = {
  base: "base",
  working: "working",
} as const;

const rangeRequestHeaders = {
  Range: "bytes=0-0",
} as const;

const statusLabelTokens = {
  added: "added",
  deleted: "deleted",
  renamed: "renamed",
} as const;

const diffStatusLabels = {
  added: "Added",
  deleted: "Deleted",
  renamed: "Renamed",
  changed: "Changed",
} as const;

function formatBytes(n: number | null): string {
  if (n === null) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function MediaSide({
  url,
  kind,
  label,
  name,
}: {
  url: string | null;
  kind: MediaKind;
  label: string;
  name: string;
}): JSX.Element {
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [bytes, setBytes] = useState<number | null>(null);

  useEffect(() => {
    if (url === null) return;
    let cancelled = false;
    /* HEAD-ish: a ranged GET gives Content-Length without pulling the body. */
    fetch(url, { headers: rangeRequestHeaders })
      .then((res) => {
        if (cancelled) return;
        const cr = res.headers.get("Content-Range");
        const total = cr?.split("/")[1];
        if (total !== undefined) setBytes(Number.parseInt(total, 10));
        else {
          const len = res.headers.get("Content-Length");
          if (len !== null) setBytes(Number.parseInt(len, 10));
        }
      })
      .catch(() => {
        /* best-effort byte size */
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (url === null) {
    return (
      <div className="fv-media-side is-empty">
        <div className="fv-media-side-label">{label}</div>
        <div className="fv-media-absent">— absent —</div>
      </div>
    );
  }

  return (
    <div className="fv-media-side">
      <div className="fv-media-side-label">{label}</div>
      {kind === mediaKinds.image ? (
        <img
          src={url}
          alt={`${label} ${name}`}
          onLoad={(e) =>
            setDims({
              w: e.currentTarget.naturalWidth,
              h: e.currentTarget.naturalHeight,
            })
          }
        />
      ) : kind === mediaKinds.video ? (
        <video src={url} controls />
      ) : (
        <audio src={url} controls />
      )}
      <div className="fv-media-meta">
        {dims !== null ? `${dims.w}×${dims.h}` : null}
        {dims !== null && bytes !== null ? " · " : null}
        {bytes !== null ? formatBytes(bytes) : null}
      </div>
    </div>
  );
}

export function MediaDiffRenderer({
  path,
  kind,
  diff,
  wireMode,
  baseRef,
  sessionId,
  refreshKey,
  onReverted,
}: MediaDiffRendererProps): JSX.Element {
  const token = useStore((s) => s.token);
  const client = useMemo(() => createClient({ baseUrl: "", token }), [token]);
  const scoped = useScopedFile(path);

  if (scoped === null) {
    return <div className="fv-error">file is outside the project root</div>;
  }

  const status = diff.file_status ?? GIT_FILE_STATUSES.modified;
  const isAdded =
    status === GIT_FILE_STATUSES.added ||
    status === GIT_FILE_STATUSES.untracked ||
    status === GIT_FILE_STATUSES.binaryAdded ||
    status === GIT_FILE_STATUSES.binaryUntracked;
  const isDeleted =
    status === GIT_FILE_STATUSES.deleted ||
    status === GIT_FILE_STATUSES.binaryDeleted;

  const baseUrl = isAdded
    ? null
    : client.gitBlobVersionUrl({
        scope: scoped.scope,
        relPath: scoped.relPath,
        version: blobVersions.base,
        mode: wireMode,
        ...(baseRef !== null ? { base: baseRef } : {}),
      });
  const workingUrl = isDeleted
    ? null
    : client.gitBlobVersionUrl({
        scope: scoped.scope,
        relPath: scoped.relPath,
        version: blobVersions.working,
        mode: wireMode,
        ...(baseRef !== null ? { base: baseRef } : {}),
      });
  const name = basenameOf(path);
  /* Cache-bust the media URLs after a revert so the <img>/<video> reloads the
     new working bytes (the rel_path/scope are unchanged). */
  const bust = (url: string | null): string | null =>
    url === null ? null : `${url}&_r=${refreshKey}`;
  const actions = diff.actions ?? actionsForStatus(status);
  const diffBase: DiffBase = wireModeToDiffBase(wireMode);

  return (
    <div className="fv-media-diff" data-testid="fv-media-diff">
      <div className="fv-media-diff-badge">{statusLabel(status)}</div>
      <div className="fv-media-diff-grid">
        <MediaSide url={bust(baseUrl)} kind={kind} label="Base" name={name} />
        <MediaSide url={bust(workingUrl)} kind={kind} label="Working" name={name} />
      </div>
      {actions.file || actions.rename ? (
        <HunkActionsBar
          absPath={path}
          relPath={scoped.relPath}
          scope={scoped.scope}
          wireMode={wireMode}
          baseRef={baseRef}
          diffBase={diffBase}
          fileStatus={status}
          actions={actions}
          {...(diff.old_path !== undefined ? { oldPath: diff.old_path } : {})}
          sessionId={sessionId}
          onReverted={onReverted}
          fileLevelOnly
        />
      ) : null}
    </div>
  );
}

function statusLabel(status: string): string {
  if (
    status.includes(statusLabelTokens.added) ||
    status === GIT_FILE_STATUSES.untracked
  ) {
    return diffStatusLabels.added;
  }
  if (status.includes(statusLabelTokens.deleted)) {
    return diffStatusLabels.deleted;
  }
  if (status.includes(statusLabelTokens.renamed)) {
    return diffStatusLabels.renamed;
  }
  return diffStatusLabels.changed;
}
