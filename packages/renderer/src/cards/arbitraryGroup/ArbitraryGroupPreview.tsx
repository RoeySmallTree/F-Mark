import { toolType } from "../toolUseCard/model.js";
import { buildPreviewSummary } from "./previewSummary.js";
import type { ArbitraryGroupView } from "./presentation.js";

interface ArbitraryGroupPreviewProps {
  view: ArbitraryGroupView;
  onOpenItem(filename: string | null): void;
}

export function ArbitraryGroupPreview({
  view,
  onOpenItem,
}: ArbitraryGroupPreviewProps): JSX.Element | null {
  const summary = buildPreviewSummary(view.renderItems);
  const hasTools = summary.tools.length > 0 || summary.subagentCount > 0;
  const hasNarrative = summary.narrativeText !== null && summary.narrativeText.length > 0;
  if (!hasTools && !hasNarrative) return null;

  return (
    <div className="toolbox-preview" aria-label="Toolbox preview">
      <div className="toolbox-preview-inner">
        {hasTools ? (
          <div className="toolbox-preview-tools" aria-label="Tools used">
            {summary.tools.map((tool) => {
              const type = toolType(tool.name);
              const label =
                tool.count > 1 ? `${type.label} ×${tool.count}` : type.label;
              return (
                <button
                  key={tool.key}
                  type="button"
                  className={`toolbox-preview-chip ${type.cls}`}
                  data-event-kind="tool-use"
                  aria-label={`Open ${tool.name} details: ${tool.detailText}`}
                  onClick={() => onOpenItem(tool.key)}
                >
                  <span className="g" aria-hidden />
                  {label}
                </button>
              );
            })}
            {summary.subagentCount > 0 ? (
              <button
                type="button"
                className="toolbox-preview-chip subagent"
                aria-label={`Open sub-agent details: ${summary.subagentCount} event${summary.subagentCount === 1 ? "" : "s"}`}
                onClick={() => onOpenItem(null)}
              >
                sub-agent
                {summary.subagentCount > 1 ? ` ×${summary.subagentCount}` : null}
              </button>
            ) : null}
          </div>
        ) : null}
        {hasNarrative ? (
          <button
            type="button"
            className="toolbox-preview-narrative toolbox-preview-text"
            aria-label={`Open toolbox: ${summary.narrativeText}`}
            onClick={() => onOpenItem(null)}
          >
            {summary.narrativeText}
          </button>
        ) : null}
      </div>
    </div>
  );
}
