import { useEffect, useMemo, useRef, useState, type JSX } from "react";
import type { SkillRef } from "@f-mark/shared";
import { Sparkles } from "lucide-react";
import { Popover } from "../popovers/Popover.js";
import {
  filterSkills,
  flattenSkills,
  groupByAgent,
  insertionFor,
} from "../modals/skills/sources.js";
import type { AgentKey } from "../modals/skills/active-agent.js";
import { buildSkillGroupRows } from "../modals/skillsPalette/model.js";
import { SkillRowButton } from "../modals/skillsPalette/SkillRowButton.js";
import { useSkillsLoader } from "../modals/skillsPalette/useSkillsLoader.js";
import type { SkillTrigger } from "./skillsTrigger.js";

const NO_LOOSE_STRING_VALUES = {
  skills: "Skills",
} as const;

interface SkillsPopoverProps {
  activeAgent: AgentKey;
  anchorRect: DOMRect | null;
  query: string;
  refreshKey: number;
  token: string | null;
  trigger: SkillTrigger | null;
  onClose(): void;
  closing?: boolean;
  onEdit(skill: SkillRef): void;
  onInsert(text: string, trigger: SkillTrigger | null): void;
}

export function SkillsPopover({
  activeAgent,
  anchorRect,
  query,
  refreshKey,
  token,
  trigger,
  onClose,
  closing = false,
  onEdit,
  onInsert,
}: SkillsPopoverProps): JSX.Element {
  const { error, loading, skills } = useSkillsLoader({
    activeAgent,
    reloadKey: refreshKey,
    token,
  });
  const filtered = useMemo(
    () => filterSkills(skills, query.trim()),
    [skills, query],
  );
  const groups = useMemo(() => groupByAgent(filtered), [filtered]);
  const flatRows = useMemo(() => flattenSkills(groups), [groups]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const resultsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setSelectedIdx(0);
  }, [query, groups]);

  useEffect(() => {
    keepSkillOptionVisible(resultsRef.current, selectedIdx);
  }, [selectedIdx]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        event.stopPropagation();
        if (flatRows.length === 0) return;
        const direction = event.key === "ArrowDown" ? 1 : -1;
        setSelectedIdx((idx) => (idx + direction + flatRows.length) % flatRows.length);
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        const row = flatRows[selectedIdx];
        if (row === undefined) return;
        onInsert(insertionFor(row), trigger);
      }
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [flatRows, onClose, onInsert, selectedIdx, trigger]);

  return (
    <Popover
      anchorRect={anchorRect}
      placement="top-start"
      className="skills-pop"
      ariaLabel={NO_LOOSE_STRING_VALUES.skills}
      onClose={onClose}
      closing={closing}
    >
      <div className="skills-pop-head">
        <Sparkles size={14} aria-hidden />
        <span className="skills-pop-query">/{query}</span>
      </div>
      <div className="skills-pop-results" ref={resultsRef} role="listbox">
        <SkillsPopoverBody
          error={error}
          flatRows={flatRows}
          groups={groups}
          loading={loading}
          query={query}
          selectedIdx={selectedIdx}
          onEdit={onEdit}
          onInsert={(skill) => onInsert(insertionFor(skill), trigger)}
          onSelect={setSelectedIdx}
        />
      </div>
    </Popover>
  );
}

interface SkillsPopoverBodyProps {
  error: string | null;
  flatRows: SkillRef[];
  groups: ReturnType<typeof groupByAgent>;
  loading: boolean;
  query: string;
  selectedIdx: number;
  onEdit(skill: SkillRef): void;
  onInsert(skill: SkillRef): void;
  onSelect(idx: number): void;
}

function SkillsPopoverBody({
  error,
  flatRows,
  groups,
  loading,
  query,
  selectedIdx,
  onEdit,
  onInsert,
  onSelect,
}: SkillsPopoverBodyProps): JSX.Element {
  if (loading) return <div className="skills-pop-empty">Loading skills...</div>;
  if (error !== null) {
    return (
      <div className="skills-pop-empty" role="alert">
        Couldn't load skills: {error}
      </div>
    );
  }
  if (flatRows.length === 0) {
    return (
      <div className="skills-pop-empty">
        {query.trim().length > 0 ? `No skills match /${query}.` : "No skills found."}
      </div>
    );
  }

  return (
    <>
      {buildSkillGroupRows(groups).map((group) => (
        <div key={group.agent}>
          <div className="cmdk-group">{group.label}</div>
          {group.rows.map((row) => (
            <SkillRowButton
              key={row.skill.path}
              badge={row.badge}
              idx={row.idx}
              skill={row.skill}
              selected={row.idx === selectedIdx}
              onActivate={onInsert}
              onEdit={onEdit}
              onSelect={onSelect}
            />
          ))}
        </div>
      ))}
    </>
  );
}

function keepSkillOptionVisible(
  container: HTMLDivElement | null,
  selectedIdx: number,
): void {
  if (container === null) return;
  const option = container.querySelector(
    `[data-skill-idx="${selectedIdx}"]`,
  ) as HTMLElement | null;
  if (option === null) return;
  const optionRect = option.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  if (optionRect.top < containerRect.top) {
    container.scrollTop -= containerRect.top - optionRect.top + 4;
  } else if (optionRect.bottom > containerRect.bottom) {
    container.scrollTop += optionRect.bottom - containerRect.bottom + 4;
  }
}
