import { type JSX } from "react";
import { Pencil, Sparkles, Terminal } from "lucide-react";
import type { SkillRef } from "@f-mark/shared";
import { skillLooksToolLike } from "./model.js";

interface SkillRowButtonProps {
  badge: string;
  idx: number;
  onActivate: (skill: SkillRef) => void;
  onEdit: (skill: SkillRef) => void;
  onSelect: (idx: number) => void;
  selected: boolean;
  skill: SkillRef;
}

export function SkillRowButton({
  badge,
  idx,
  onActivate,
  onEdit,
  onSelect,
  selected,
  skill,
}: SkillRowButtonProps): JSX.Element {
  return (
    <div
      className={`cmdk-row skill-row${selected ? " sel" : ""}`}
      data-skill-idx={idx}
      data-skill-name={skill.name}
      data-skill-agent={skill.agent}
      role="option"
      aria-selected={selected}
      onMouseEnter={() => onSelect(idx)}
      onClick={() => onActivate(skill)}
    >
      <button
        type="button"
        className="skill-row-pick"
        onClick={(event) => {
          event.stopPropagation();
          onActivate(skill);
        }}
      >
        <span className="cmdk-icon">
          <SkillIcon skill={skill} />
        </span>
        <div className="skill-text">
          <div className="skill-name">
            /{skill.name}
            {typeof skill.args === "string" && skill.args.length > 0 ? (
              <span className="skill-args"> {skill.args}</span>
            ) : null}
          </div>
          {skill.description.length > 0 ? (
            <div className="skill-desc">{skill.description}</div>
          ) : null}
        </div>
        <span className="skill-badge">{badge}</span>
      </button>
      <button
        type="button"
        className="skill-row-edit"
        aria-label={`Edit ${skill.name}`}
        title="Edit skill"
        onClick={(event) => {
          event.stopPropagation();
          onEdit(skill);
        }}
      >
        <Pencil size={13} aria-hidden />
      </button>
    </div>
  );
}

function SkillIcon({ skill }: { skill: SkillRef }): JSX.Element {
  if (skillLooksToolLike(skill)) {
    return <Terminal size={13} aria-hidden />;
  }
  return <Sparkles size={13} aria-hidden />;
}
