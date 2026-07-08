import {
  useEffect,
  useRef,
  useState,
  type JSX,
  type KeyboardEvent,
} from "react";
import { Search } from "lucide-react";
import type { CmdkGroup, CmdkRow } from "./sources.js";
import { IconFor } from "./icons.js";

const NO_LOOSE_STRING_VALUES = {
  off: "off",
} as const;

interface CmdKPaletteViewProps {
  flatRows: CmdkRow[];
  groups: CmdkGroup[];
  onActivate: (row: CmdkRow) => void;
  onQueryChange: (query: string) => void;
  query: string;
}

export function CmdKPaletteView(props: CmdKPaletteViewProps): JSX.Element {
  const { flatRows, groups, onActivate, onQueryChange, query } = props;
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const resultsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setSelectedIdx(0);
  }, [groups]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const container = resultsRef.current;
    if (container === null) return;
    keepOptionVisible(container, selectedIdx);
  }, [selectedIdx]);

  function onInputKeyDown(e: KeyboardEvent<HTMLInputElement>): void {
    if (isArrowKey(e.key)) {
      e.preventDefault();
      moveSelection(e.key, selectedIdx, flatRows.length);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const row = flatRows[selectedIdx];
      if (row !== undefined) onActivate(row);
    }
  }

  let rowIdx = -1;

  return (
    <div
      className="modal cmdk-modal"
      onClick={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <div className="cmdk">
        <div className="cmdk-input-row">
          <Search size={16} style={{ color: "var(--ink-4)" }} aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            className="cmdk-input"
            placeholder="Search sessions, contributions, todos, quick actions…"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={onInputKeyDown}
            aria-label="Command palette query"
            autoComplete={NO_LOOSE_STRING_VALUES.off}
            spellCheck={false}
          />
          <kbd>esc</kbd>
        </div>

        <div className="cmdk-results" ref={resultsRef} role="listbox">
          {flatRows.length === 0 ? (
            <div className="cmdk-empty">
              No matches for “{query.trim()}”.
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.key}>
                <div className="cmdk-group">{group.label}</div>
                {group.rows.map((row) => {
                  rowIdx += 1;
                  const idx = rowIdx;
                  const selected = idx === selectedIdx;
                  return (
                    <CmdKRowButton
                      key={row.id}
                      idx={idx}
                      row={row}
                      selected={selected}
                      onActivate={onActivate}
                      onSelect={setSelectedIdx}
                    />
                  );
                })}
              </div>
            ))
          )}
        </div>

        <CmdKFooter />
      </div>
    </div>
  );

  function moveSelection(
    key: string,
    currentIdx: number,
    rowCount: number,
  ): void {
    if (rowCount === 0) return;
    const direction = key === "ArrowDown" ? 1 : -1;
    setSelectedIdx((currentIdx + direction + rowCount) % rowCount);
  }
}

function isArrowKey(key: string): boolean {
  return key === "ArrowDown" || key === "ArrowUp";
}

function keepOptionVisible(container: HTMLDivElement, selectedIdx: number): void {
  const option = container.querySelector(
    `[data-cmdk-idx="${selectedIdx}"]`,
  ) as HTMLElement | null;
  if (option === null) return;

  const optionTop = option.offsetTop;
  const optionBottom = optionTop + option.offsetHeight;
  const visibleTop = container.scrollTop;
  const visibleBottom = visibleTop + container.clientHeight;
  if (optionTop < visibleTop) {
    container.scrollTop = optionTop - 4;
  } else if (optionBottom > visibleBottom) {
    container.scrollTop = optionBottom - container.clientHeight + 4;
  }
}

interface CmdKRowButtonProps {
  idx: number;
  onActivate: (row: CmdkRow) => void;
  onSelect: (idx: number) => void;
  row: CmdkRow;
  selected: boolean;
}

function CmdKRowButton(props: CmdKRowButtonProps): JSX.Element {
  const { idx, onActivate, onSelect, row, selected } = props;
  return (
    <button
      type="button"
      className={`cmdk-row${selected ? " sel" : ""}`}
      data-cmdk-idx={idx}
      data-cmdk-kind={row.kind}
      data-cmdk-id={row.id}
      role="option"
      aria-selected={selected}
      onMouseEnter={() => onSelect(idx)}
      onClick={() => onActivate(row)}
    >
      <span className="cmdk-icon">
        <IconFor icon={row.icon} />
      </span>
      <span className="cmdk-label">{row.label}</span>
      <span className="cmdk-sub">{row.sub}</span>
      <span className="cmdk-kind">{row.kind}</span>
    </button>
  );
}

const FOOTER_ITEMS = [
  { keys: ["↑", "↓"], label: "navigate" },
  { keys: ["↵"], label: "open" },
  { keys: ["esc"], label: "close" },
];

function CmdKFooter(): JSX.Element {
  return (
    <div className="cmdk-foot">
      {FOOTER_ITEMS.map((item) => (
        <span key={item.label}>
          {item.keys.map((key) => (
            <kbd key={key}>{key}</kbd>
          ))}
          {item.label}
        </span>
      ))}
    </div>
  );
}
