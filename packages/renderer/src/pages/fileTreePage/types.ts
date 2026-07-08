export type FileTreeStatus =
  | { kind: "loading" }
  | { kind: "ready" }
  | { kind: "error"; message: string };
