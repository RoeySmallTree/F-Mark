import { useCallback, useRef, useEffect } from "react";
import { CaseSensitive, Regex, WholeWord } from "lucide-react";
import { useStore, type FilesSearchState } from "../../../state/store.js";

const NO_LOOSE_STRING_VALUES = {
  off: "off",
  casesensitive: "caseSensitive",
  whole: "whole",
  regex: "regex",
} as const;

export interface FilesSearchProps {
  search: FilesSearchState;
  searchValid: boolean;
  autoFocus: boolean;
}

export function FilesSearch({
  search,
  searchValid,
  autoFocus,
}: FilesSearchProps): JSX.Element {
  const setFilesSearch = useStore((s) => s.setFilesSearch);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const onChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setFilesSearch({ q: e.target.value });
    },
    [setFilesSearch],
  );

  const toggle = useCallback(
    (key: "whole" | "regex" | "caseSensitive") => () => {
      setFilesSearch({ [key]: !search[key] } as Partial<FilesSearchState>);
    },
    [search, setFilesSearch],
  );

  return (
    <div className="files-search">
      <input
        ref={inputRef}
        type="search"
        className={`files-search-input ${search.q.length > 0 && !searchValid ? "is-invalid" : ""}`}
        placeholder="filter files…"
        value={search.q}
        onChange={onChange}
        spellCheck={false}
        autoCorrect={NO_LOOSE_STRING_VALUES.off}
        autoCapitalize={NO_LOOSE_STRING_VALUES.off}
      />
      <button
        type="button"
        className={`files-search-toggle ${search.caseSensitive ? "is-on" : ""}`}
        onClick={toggle(NO_LOOSE_STRING_VALUES.casesensitive)}
        title="Match case"
        aria-pressed={search.caseSensitive}
        aria-label="Match case"
      >
        <CaseSensitive size={13} aria-hidden />
      </button>
      <button
        type="button"
        className={`files-search-toggle ${search.whole ? "is-on" : ""}`}
        onClick={toggle(NO_LOOSE_STRING_VALUES.whole)}
        title="Whole word"
        aria-pressed={search.whole}
        aria-label="Whole word"
      >
        <WholeWord size={13} aria-hidden />
      </button>
      <button
        type="button"
        className={`files-search-toggle ${search.regex ? "is-on" : ""}`}
        onClick={toggle(NO_LOOSE_STRING_VALUES.regex)}
        title="Regular expression"
        aria-pressed={search.regex}
        aria-label="Regular expression"
      >
        <Regex size={13} aria-hidden />
      </button>
    </div>
  );
}
