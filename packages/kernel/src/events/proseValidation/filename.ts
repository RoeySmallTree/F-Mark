/* {2,16} segment accommodates the longest runtime slug "opencode"
   (ids like `ag-opencode-3a2f`). Lockstep with ID_PATTERN (participants.ts)
   and FILENAME_REGEX (shared/filenames.ts). */
export const EVENT_FILENAME_RE =
  /^\d{8}T\d{6}(?:\.\d{3})?Z_(?:us|ag|sys|grp)-[a-z0-9-]{2,16}\.[a-z-]+(?:\.[a-z0-9]+)?$/;
