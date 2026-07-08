import { BinaryDiffBadge } from "../diff/BinaryDiffBadge.js";
import { LineDiffRenderer } from "../diff/LineDiffRenderer.js";
import { MediaDiffRenderer } from "../diff/MediaDiffRenderer.js";
import { MonacoDiffRenderer } from "../diff/MonacoDiffRenderer.js";
import type { RendererKind } from "../renderers/pickRenderer.js";
import type { RenderableDiff } from "./model.js";

export interface DiffFileBodyProps {
  kind: RendererKind;
  path: string;
  sessionId: string | null;
  renderableDiff: RenderableDiff;
}

interface DiffRendererProps extends DiffFileBodyProps {
  renderKey: string;
}

type DiffRenderer = (props: DiffRendererProps) => JSX.Element;

const DIFF_RENDERERS = {
  monaco: ({
    path,
    sessionId,
    renderKey,
    renderableDiff,
  }) => (
    <MonacoDiffRenderer
      key={renderKey}
      path={path}
      diff={renderableDiff.diff}
      wireMode={renderableDiff.wireMode}
      style={renderableDiff.style}
      baseRef={renderableDiff.baseRef}
      sessionId={sessionId}
      refreshKey={renderableDiff.refreshKey}
      onReverted={renderableDiff.onReverted}
    />
  ),
  json: ({
    path,
    sessionId,
    renderKey,
    renderableDiff,
  }) => (
    <MonacoDiffRenderer
      key={renderKey}
      path={path}
      diff={renderableDiff.diff}
      wireMode={renderableDiff.wireMode}
      style={renderableDiff.style}
      baseRef={renderableDiff.baseRef}
      sessionId={sessionId}
      refreshKey={renderableDiff.refreshKey}
      onReverted={renderableDiff.onReverted}
    />
  ),
  markdown: (props) => <TextDiffBody {...props} />,
  csv: (props) => <TextDiffBody {...props} />,
  image: (props) => <MediaDiffBody {...props} kind="image" />,
  audio: (props) => <MediaDiffBody {...props} kind="audio" />,
  video: (props) => <MediaDiffBody {...props} kind="video" />,
  pdf: (props) => <BinaryDiffBody {...props} />,
  "office-xlsx": (props) => <BinaryDiffBody {...props} />,
  "office-docx": (props) => <BinaryDiffBody {...props} />,
  "office-pptx": (props) => <BinaryDiffBody {...props} />,
  binary: (props) => <BinaryDiffBody {...props} />,
} satisfies Record<RendererKind, DiffRenderer>;

export function DiffFileBody({
  kind,
  path,
  sessionId,
  renderableDiff,
}: DiffFileBodyProps): JSX.Element {
  const renderKey = `${path}#${renderableDiff.wireMode}#${renderableDiff.baseRef ?? ""}#${renderableDiff.style}`;
  return DIFF_RENDERERS[kind]({
    kind,
    path,
    sessionId,
    renderableDiff,
    renderKey,
  });
}

function TextDiffBody({
  path,
  sessionId,
  renderKey,
  renderableDiff,
}: DiffRendererProps): JSX.Element {
  return (
    <LineDiffRenderer
      key={renderKey}
      path={path}
      diff={renderableDiff.diff}
      wireMode={renderableDiff.wireMode}
      style={renderableDiff.style}
      baseRef={renderableDiff.baseRef}
      sessionId={sessionId}
      onReverted={renderableDiff.onReverted}
    />
  );
}

function MediaDiffBody({
  kind,
  path,
  sessionId,
  renderKey,
  renderableDiff,
}: DiffRendererProps & { kind: "image" | "audio" | "video" }): JSX.Element {
  return (
    <MediaDiffRenderer
      key={renderKey}
      path={path}
      kind={kind}
      diff={renderableDiff.diff}
      wireMode={renderableDiff.wireMode}
      baseRef={renderableDiff.baseRef}
      sessionId={sessionId}
      refreshKey={renderableDiff.refreshKey}
      onReverted={renderableDiff.onReverted}
    />
  );
}

function BinaryDiffBody({
  path,
  sessionId,
  renderKey,
  renderableDiff,
}: DiffRendererProps): JSX.Element {
  return (
    <BinaryDiffBadge
      key={renderKey}
      path={path}
      diff={renderableDiff.diff}
      wireMode={renderableDiff.wireMode}
      baseRef={renderableDiff.baseRef}
      sessionId={sessionId}
      onReverted={renderableDiff.onReverted}
    />
  );
}
