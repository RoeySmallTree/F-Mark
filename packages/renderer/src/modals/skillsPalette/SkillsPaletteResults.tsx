import { useMemo, type JSX, type RefObject } from "react";
import { buildSkillGroupRows } from "./model.js";
import { SkillRowButton } from "./SkillRowButton.js";
import type { SkillsPaletteController } from "./types.js";

interface SkillsPaletteResultsProps {
  controller: SkillsPaletteController;
  resultsRef: RefObject<HTMLDivElement>;
  selectedIdx: number;
  onSelect: (idx: number) => void;
}

export function SkillsPaletteResults({
  controller,
  resultsRef,
  selectedIdx,
  onSelect,
}: SkillsPaletteResultsProps): JSX.Element {
  return (
    <div className="cmdk-results" ref={resultsRef} role="listbox">
      <SkillsPaletteResultsBody
        controller={controller}
        selectedIdx={selectedIdx}
        onSelect={onSelect}
      />
    </div>
  );
}

interface SkillsPaletteResultsBodyProps {
  controller: SkillsPaletteController;
  selectedIdx: number;
  onSelect: (idx: number) => void;
}

function SkillsPaletteResultsBody({
  controller,
  selectedIdx,
  onSelect,
}: SkillsPaletteResultsBodyProps): JSX.Element {
  if (controller.loading) {
    return <div className="cmdk-empty">Loading skills…</div>;
  }
  if (controller.error !== null) {
    return (
      <div className="cmdk-empty" role="alert">
        Couldn’t load skills: {controller.error}
      </div>
    );
  }
  if (controller.flatRows.length === 0) {
    return <SkillsPaletteEmpty query={controller.query} />;
  }
  return (
    <SkillGroups
      controller={controller}
      selectedIdx={selectedIdx}
      onSelect={onSelect}
    />
  );
}

function SkillsPaletteEmpty({ query }: { query: string }): JSX.Element {
  const trimmed = query.trim();
  return (
    <div className="cmdk-empty">
      {trimmed.length > 0
        ? `No skills match “${trimmed}”.`
        : "No skills found. Install agent-specific skills under .claude/skills/, .codex/skills/, .opencode/skills/, or .skills/."}
    </div>
  );
}

interface SkillGroupsProps {
  controller: SkillsPaletteController;
  selectedIdx: number;
  onSelect: (idx: number) => void;
}

function SkillGroups({
  controller,
  selectedIdx,
  onSelect,
}: SkillGroupsProps): JSX.Element {
  const groupRows = useMemo(
    () => buildSkillGroupRows(controller.groups),
    [controller.groups],
  );
  return (
    <>
      {groupRows.map((group) => (
        <div key={group.agent} data-testid={`skills-group-${group.agent}`}>
          <div className="cmdk-group">{group.label}</div>
          {group.rows.map((row) => (
            <SkillRowButton
              key={row.skill.path}
              badge={row.badge}
              idx={row.idx}
              skill={row.skill}
              selected={row.idx === selectedIdx}
              onSelect={onSelect}
              onActivate={controller.activate}
              onEdit={controller.editSkill}
            />
          ))}
        </div>
      ))}
    </>
  );
}
