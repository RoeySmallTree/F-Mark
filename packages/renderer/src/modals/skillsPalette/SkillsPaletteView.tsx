import { type JSX } from "react";
import { SkillsPaletteFooter } from "./SkillsPaletteFooter.js";
import { SkillsPaletteHeader } from "./SkillsPaletteHeader.js";
import { SkillsPaletteResults } from "./SkillsPaletteResults.js";
import type { SkillsPaletteController } from "./types.js";
import { useSkillsPaletteSelection } from "./useSkillsPaletteSelection.js";

interface SkillsPaletteViewProps {
  controller: SkillsPaletteController;
}

export function SkillsPaletteView({
  controller,
}: SkillsPaletteViewProps): JSX.Element {
  const selection = useSkillsPaletteSelection({
    flatRows: controller.flatRows,
    groups: controller.groups,
    onActivate: controller.activate,
  });

  return (
    <div
      className="modal cmdk-modal"
      onClick={(event) => event.stopPropagation()}
      role="dialog"
      aria-modal="true"
      aria-label="Skills palette"
    >
      <div className="cmdk skills-pal">
        <SkillsPaletteHeader
          activeAgent={controller.activeAgent}
          inputRef={selection.inputRef}
          query={controller.query}
          onAgentChange={controller.changeAgent}
          onInputKeyDown={selection.onInputKeyDown}
          onQueryChange={controller.setQuery}
        />
        <SkillsPaletteResults
          controller={controller}
          resultsRef={selection.resultsRef}
          selectedIdx={selection.selectedIdx}
          onSelect={selection.selectByMouse}
        />
        <SkillsPaletteFooter />
      </div>
    </div>
  );
}
