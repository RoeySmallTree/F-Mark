export interface FilesSearchState {
  q: string;
  whole: boolean;
  regex: boolean;
  caseSensitive: boolean;
  exts: string[];
}

export const DEFAULT_FILES_SEARCH: FilesSearchState = {
  q: "",
  whole: false,
  regex: false,
  caseSensitive: false,
  exts: [],
};
