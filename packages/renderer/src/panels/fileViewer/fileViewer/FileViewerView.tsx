import type { ReactNode } from "react";
import { FileViewerErrorBoundary } from "../FileViewerErrorBoundary.js";
import { FileViewerBody } from "./FileViewerBody.js";
import { FileViewerChrome } from "./FileViewerChrome.js";
import type { FileViewerModel } from "./model.js";

const NO_LOOSE_STRING_VALUES = {
  empty: "empty",
} as const;

export interface FileViewerViewProps {
  model: FileViewerModel;
  leadingControls?: ReactNode;
  trailingControls?: ReactNode;
  canPopOut: boolean;
}

export function FileViewerView({
  model,
  leadingControls,
  trailingControls,
  canPopOut,
}: FileViewerViewProps): JSX.Element {
  return (
    <div className="fv-root">
      <FileViewerChrome
        model={model}
        leadingControls={leadingControls}
        trailingControls={trailingControls}
        canPopOut={canPopOut}
      />
      <div className="fv-body" key={model.active ?? "empty"}>
        <FileViewerErrorBoundary resetKey={model.active ?? NO_LOOSE_STRING_VALUES.empty}>
          <FileViewerBody model={model} />
        </FileViewerErrorBoundary>
      </div>
    </div>
  );
}
