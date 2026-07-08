import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from "react";
import type { SkillRef } from "@f-mark/shared";
import type { SkillGroup } from "../skills/sources.js";

interface SkillsPaletteSelectionInput {
  flatRows: SkillRef[];
  groups: SkillGroup[];
  onActivate: (skill: SkillRef) => void;
}

interface SkillsPaletteSelection {
  inputRef: RefObject<HTMLInputElement>;
  resultsRef: RefObject<HTMLDivElement>;
  selectedIdx: number;
  onInputKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  selectByMouse: (idx: number) => void;
}

export function useSkillsPaletteSelection(
  input: SkillsPaletteSelectionInput,
): SkillsPaletteSelection {
  const { flatRows, groups, onActivate } = input;
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const resultsRef = useRef<HTMLDivElement | null>(null);
  const scrollIntoViewOnNext = useRef(false);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setSelectedIdx(0);
  }, [groups]);

  useEffect(() => {
    if (!scrollIntoViewOnNext.current) return;
    scrollIntoViewOnNext.current = false;
    const container = resultsRef.current;
    if (container === null) return;
    keepSkillOptionVisible(container, selectedIdx);
  }, [selectedIdx]);

  function onInputKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      moveSelection(event.key, flatRows.length);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const row = flatRows[selectedIdx];
      if (row !== undefined) onActivate(row);
    }
  }

  function moveSelection(key: string, rowCount: number): void {
    if (rowCount === 0) return;
    scrollIntoViewOnNext.current = true;
    const direction = key === "ArrowDown" ? 1 : -1;
    setSelectedIdx((idx) => (idx + direction + rowCount) % rowCount);
  }

  function selectByMouse(idx: number): void {
    scrollIntoViewOnNext.current = false;
    setSelectedIdx(idx);
  }

  return {
    inputRef,
    resultsRef,
    selectedIdx,
    onInputKeyDown,
    selectByMouse,
  };
}

function keepSkillOptionVisible(
  container: HTMLDivElement,
  selectedIdx: number,
): void {
  const option = container.querySelector(
    `[data-skill-idx="${selectedIdx}"]`,
  ) as HTMLElement | null;
  if (option === null) return;

  const optionRect = option.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  const optionTop = optionRect.top - containerRect.top + container.scrollTop;
  const nextScrollTop = skillOptionScrollTop({
    optionHeight: option.offsetHeight,
    optionTop,
    visibleHeight: container.clientHeight,
    visibleTop: container.scrollTop,
  });
  if (nextScrollTop !== null) container.scrollTop = nextScrollTop;
}

interface SkillOptionScrollInput {
  optionHeight: number;
  optionTop: number;
  visibleHeight: number;
  visibleTop: number;
}

function skillOptionScrollTop(input: SkillOptionScrollInput): number | null {
  if (input.optionTop < input.visibleTop) return input.optionTop - 4;
  const optionBottom = input.optionTop + input.optionHeight;
  const visibleBottom = input.visibleTop + input.visibleHeight;
  return optionBottom > visibleBottom
    ? optionBottom - input.visibleHeight + 4
    : null;
}
