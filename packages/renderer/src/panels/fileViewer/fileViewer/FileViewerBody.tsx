import { DiffFileBody } from "./DiffFileBody.js";
import { PlainFileBody } from "./PlainFileBody.js";
import { getRenderableDiff, type FileViewerModel } from "./model.js";

export interface FileViewerBodyProps {
  model: FileViewerModel;
}

export function FileViewerBody({
  model,
}: FileViewerBodyProps): JSX.Element {
  const { active, kind, diffState, outcome, sessionId } = model;
  if (active === null || kind === null) {
    return <FileViewerEmptyState />;
  }

  const renderableDiff = getRenderableDiff(diffState, outcome);
  if (renderableDiff !== null) {
    return (
      <DiffFileBody
        kind={kind}
        path={active}
        sessionId={sessionId}
        renderableDiff={renderableDiff}
      />
    );
  }

  return <PlainFileBody kind={kind} path={active} />;
}

function FileViewerEmptyState(): JSX.Element {
  return (
    <div className="fv-empty">
      <div className="fv-empty-icon-outer" aria-hidden="true">
        <div className="fv-empty-icon-inner">
          <EyeSvg />
        </div>
      </div>
      <p>No file open.</p>
      <p className="fv-empty-hint">Click a file in the tree to open it.</p>
    </div>
  );
}

function EyeSvg(): JSX.Element {
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* eyelid fill */}
      <path
        d="M4 20C4 20 10 8 20 8C30 8 36 20 36 20C36 20 30 32 20 32C10 32 4 20 4 20Z"
        fill="currentColor"
        opacity="0.1"
      />
      {/* eyelid outline */}
      <path
        d="M4 20C4 20 10 8 20 8C30 8 36 20 36 20C36 20 30 32 20 32C10 32 4 20 4 20Z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      {/* iris */}
      <circle
        cx="20"
        cy="20"
        r="6.5"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      {/* pupil */}
      <circle cx="20" cy="20" r="2.8" fill="currentColor" />
    </svg>
  );
}
