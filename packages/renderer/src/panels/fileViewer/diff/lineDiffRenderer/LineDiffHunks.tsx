import type { GitHunk } from "@f-mark/shared";
import { expandHunk, visibleLineText } from "./model.js";
import { LINE_DIFF_KINDS, type ParsedLine } from "./types.js";

const splitPaneSides = {
  before: "before",
  after: "after",
} as const;

interface LineDiffHunksProps {
  hunks: GitHunk[];
  renderActionBar: (hunk: GitHunk) => JSX.Element;
}

export function SplitLineDiffHunks({
  hunks,
  renderActionBar,
}: LineDiffHunksProps): JSX.Element {
  return (
    <>
      {hunks.map((hunk) => {
        const lines = expandHunk(hunk);
        const before = lines.filter((line) => line.kind !== LINE_DIFF_KINDS.add);
        const after = lines.filter(
          (line) => line.kind !== LINE_DIFF_KINDS.delete,
        );
        return (
          <div className="fv-hunk-block" key={hunk.id}>
            <div className="fv-hunk-head">
              <span className="fv-hunk-header-text">{hunk.header}</span>
              {renderActionBar(hunk)}
            </div>
            <div className="diff-body diff-split">
              <div className="diff-pane before">
                <div className="diff-pane-title">Base</div>
                {before.map((line, index) => (
                  <SplitPaneLine
                    key={`b-${index}`}
                    line={line}
                    lineNumber={line.oldNo}
                    side={splitPaneSides.before}
                  />
                ))}
              </div>
              <div className="diff-pane after">
                <div className="diff-pane-title">Working</div>
                {after.map((line, index) => (
                  <SplitPaneLine
                    key={`a-${index}`}
                    line={line}
                    lineNumber={line.newNo}
                    side={splitPaneSides.after}
                  />
                ))}
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}

export function InlineLineDiffHunks({
  hunks,
  renderActionBar,
}: LineDiffHunksProps): JSX.Element {
  return (
    <>
      {hunks.map((hunk) => {
        const lines = expandHunk(hunk);
        return (
          <div className="fv-hunk-block" key={hunk.id}>
            <div className="fv-hunk-head">
              <span className="fv-hunk-header-text">{hunk.header}</span>
              {renderActionBar(hunk)}
            </div>
            <div className="diff-body">
              {lines.map((line, index) => (
                <InlineDiffLine
                  key={`l-${index}`}
                  line={line}
                />
              ))}
            </div>
          </div>
        );
      })}
    </>
  );
}

function InlineDiffLine({ line }: { line: ParsedLine }): JSX.Element {
  return (
    <div className={`diff-line ${line.kind}`}>
      <span className="diff-gutter">{line.oldNo ?? ""}</span>
      <span className="diff-gutter">{line.newNo ?? ""}</span>
      <span className="diff-code">{visibleLineText(line.text)}</span>
    </div>
  );
}

function SplitPaneLine({
  line,
  lineNumber,
  side,
}: {
  line: ParsedLine;
  lineNumber: number | null;
  side: "before" | "after";
}): JSX.Element {
  const kind =
    side === splitPaneSides.before
      ? line.kind === LINE_DIFF_KINDS.delete
        ? LINE_DIFF_KINDS.delete
        : LINE_DIFF_KINDS.context
      : line.kind === LINE_DIFF_KINDS.add
        ? LINE_DIFF_KINDS.add
        : LINE_DIFF_KINDS.context;

  return (
    <div className={`diff-pane-row ${kind}`}>
      <span className="diff-gutter">{lineNumber ?? ""}</span>
      <span className="diff-code">{visibleLineText(line.text)}</span>
    </div>
  );
}
