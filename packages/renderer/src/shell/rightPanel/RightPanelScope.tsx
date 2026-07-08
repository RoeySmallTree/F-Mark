import { type JSX } from "react";
import type { RightPanelActivePane } from "./useRightPanelDockController.js";

const NO_LOOSE_STRING_VALUES = {
  files: "files",
  rtl: "rtl",
  ltr: "ltr",
  plaintext: "plaintext",
} as const;

interface Props {
  activePane: RightPanelActivePane;
  activePath: string | null;
  slug: string;
}

export function RightPanelScope({
  activePane,
  activePath,
  slug,
}: Props): JSX.Element {
  const value = activePane === NO_LOOSE_STRING_VALUES.files ? (activePath ?? "no path") : slug;
  return (
    <div className="panel-scope" title={value}>
      <span className="panel-scope-prefix">in</span>
      <span
        className="panel-scope-value"
        style={{
          direction: activePane === NO_LOOSE_STRING_VALUES.files
            ? NO_LOOSE_STRING_VALUES.rtl
            : NO_LOOSE_STRING_VALUES.ltr,
          unicodeBidi: NO_LOOSE_STRING_VALUES.plaintext,
        }}
      >
        {value}
      </span>
    </div>
  );
}
