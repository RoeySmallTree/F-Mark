import type {
  AnyEventRecord,
  CreateSessionRequest,
  EventKind,
  EventListParams,
  EnsureManagedAgentsRequest,
  EnsureManagedAgentsResponse,
  ForkSessionRequest,
  ForkSessionResponse,
  GitChangedFilesResponse,
  GitBranchRefsResponse,
  GitDiffMode,
  GitDiffResponse,
  GitDiffSettingsResponse,
  GitFileVersionResponse,
  GitRevertAction,
  GitRevertHunkResponse,
  ListSessionEventsResponse,
  Participant,
  PostChoiceBody,
  PostFileBody,
  PostFlowBody,
  PostHtmlBody,
  PostProseBody,
  PostTodoBody,
  Preset,
  RegisteredAgent,
  SearchHit,
  SessionEventGroup,
  SessionMeta,
  SkillFile,
  SkillRef,
  TodoListResponse,
  UpdateParticipantPatch,
  UpdateUserProfilePatch,
  UpdatedParticipant,
  UpdateSessionRequest,
  UploadAttachmentResponse,
  UserProfile,
} from "@f-mark/shared";

import { createHttpClient } from "./client/core.js";
import { createDiscoveryMethods } from "./client/discovery.js";
import { createEventMethods } from "./client/events.js";
import { createFileMethods } from "./client/files.js";
import { createGitMethods } from "./client/git.js";
import { createIdentityMethods } from "./client/identity.js";
import { createPathMethods } from "./client/paths.js";
import { createSessionMethods } from "./client/sessions.js";
import type { RootScope } from "./rootScope.js";

export interface ClientConfig {
  baseUrl: string;
  token: string | null;
}

export interface ListAllSessionEventsOptions {
  incremental?: boolean;
  since?: string;
  withResponse?: boolean;
}

export type { RootScope } from "./rootScope.js";
export { GitRevertError } from "./client/core.js";

export type {
  EventListParams,
  ForkSessionRequest,
  ForkSessionResponse,
  PostChoiceBody,
  PostFileBody,
  PostFlowBody,
  PostHtmlBody,
  PostProseBody,
  PostTodoBody,
  SessionEventGroup,
  SessionMeta,
  TodoListResponse,
  UpdateParticipantPatch,
  UpdateUserProfilePatch,
  UpdatedParticipant,
  UpdateSessionRequest,
  UploadAttachmentResponse,
  UserProfile,
} from "@f-mark/shared";

export interface UploadAttachmentInput {
  file: File;
  participant_id?: string;
  display_name?: string;
  description?: string;
}

export interface HealthInfo {
  status: string;
  version: string;
  processApiEnabled?: boolean;
  devKernelRestartEnabled?: boolean;
}

export interface FsListEntry {
  name: string;
  isDir: boolean;
}
export interface FsListResponse {
  path: string;
  parent: string | null;
  entries: FsListEntry[];
  truncated: boolean;
}

export interface PathFavorite {
  name: string;
  path: string;
}

export interface PathRegistryEntry {
  path: string;
  path_id: string;
  favorite?: string;
  registered: boolean;
}

export interface FilesTreeEntry {
  index: number;
  parent: number | null;
  name: string;
  relPath: string;
  isDir: boolean;
  isSymlink: boolean;
  ext: string | null;
  size: number | null;
  mtimeMs: number;
  ignored: boolean;
  depth: number;
}

export interface FilesTreeResponse {
  root: string;
  entries: FilesTreeEntry[];
  truncated: boolean;
  truncatedAt: number;
}

export type FilesFavoritesScope = "project" | "session";

export interface FilesFavoritesResponse {
  paths: string[];
}

export interface FileTextResponse {
  content: string;
  truncated: boolean;
  size: number;
  mtimeMs: number;
}

export interface PathsResponse {
  paths?: PathRegistryEntry[];
  fallbackPath?: string | null;
  fallbackPathId?: string | null;
  activePath: string | null;
  /** @deprecated sha256(realpath)[0..11] of the fallback path. */
  activePathId: string | null;
  /** @deprecated legacy active-root revision. */
  activeRevision: number;
  knownPaths: string[];
  favorites: PathFavorite[];
}

export interface Client {
  listSessions(scope?: RootScope): Promise<SessionMeta[]>;
  listAllSessions(): Promise<SessionMeta[]>;
  createSession(input: CreateSessionRequest): Promise<SessionMeta>;
  updateSession(
    sessionId: string,
    input: UpdateSessionRequest & { path_id?: string; root?: string },
  ): Promise<SessionMeta>;
  deleteSession(sessionId: string, pathOrScope?: string | RootScope): Promise<void>;
  forkSession(
    sourceSessionId: string,
    input: ForkSessionRequest,
  ): Promise<ForkSessionResponse>;
  listAllSessionEvents(
    kinds?: EventKind[],
    opts?: ListAllSessionEventsOptions & { withResponse: true },
  ): Promise<ListSessionEventsResponse>;
  listAllSessionEvents(
    kinds?: EventKind[],
    opts?: ListAllSessionEventsOptions,
  ): Promise<SessionEventGroup[]>;
  /** Browse a folder on the kernel host. Used by the session-folder picker. */
  fsList(path: string): Promise<FsListResponse>;
  /** Default starting points for the folder picker. */
  fsHome(): Promise<{ home: string; xdgConfigHome: string | null }>;
  /** Read the multi-path state — activePath, knownPaths, favorites. */
  getPaths(): Promise<PathsResponse>;
  /** Switch the active path. Kernel validates + persists + bumps revision. */
  setActivePath(path: string): Promise<PathsResponse>;
  /** Register/MRU-promote a known path without switching kernel active root. */
  registerKnownPath(path: string): Promise<PathsResponse>;
  /** Clear the active path (renderer goes to empty state). */
  clearActivePath(): Promise<PathsResponse>;
  /** Remove an entry from knownPaths (e.g., user moved a folder). */
  removeKnownPath(path: string): Promise<{ knownPaths: string[] }>;
  addFavorite(input: { name: string; path: string }): Promise<{ favorites: PathFavorite[] }>;
  removeFavorite(path: string): Promise<{ favorites: PathFavorite[] }>;
  renameFavorite(input: { path: string; newName: string }): Promise<{ favorites: PathFavorite[] }>;
  /** Walk a known project root's filesystem and return a flat entry tree.
      Root scope is required (X4b) — pass {pathId} or {root}. */
  fetchFilesTree(scope: RootScope): Promise<FilesTreeResponse>;
  /** `root` scopes the favorites to a known project root — required by the
      standalone /file-tree tab (X6); omitted in-app, where the server falls
      back to the active project. */
  fetchFilesFavorites(
    scope: FilesFavoritesScope,
    sessionId?: string,
    root?: RootScope,
  ): Promise<FilesFavoritesResponse>;
  addFilesFavorite(input: {
    scope: FilesFavoritesScope;
    sessionId?: string;
    path: string;
    root?: RootScope;
  }): Promise<FilesFavoritesResponse>;
  removeFilesFavorite(input: {
    scope: FilesFavoritesScope;
    sessionId?: string;
    path: string;
    root?: RootScope;
  }): Promise<FilesFavoritesResponse>;
  /** Absolute URL for streaming a file's binary content (with auth token).
      Used by <img>, <video>, <audio>, and the office viewers. Range-aware
      so the browser's media controls can seek. Root scope + root-relative
      path are required (X4b). */
  fileContentUrl(scope: RootScope, relPath: string): string;
  /** Fetch a file as UTF-8 text (truncated to maxBytes). For Monaco/Cherry.
      Root scope + root-relative path are required (X4b). */
  fetchFileText(
    scope: RootScope,
    relPath: string,
    maxBytes?: number,
  ): Promise<FileTextResponse>;
  saveFileText(
    scope: RootScope,
    relPath: string,
    content: string,
  ): Promise<FileTextResponse>;
  /* ── read-only git diff (design §8) ─────────────────────────────────── */
  /** List changed files (diff ∪ untracked). `mode=session` filters to the
      session's tool-use-touched files; `mode=branch` is whole-branch. */
  gitChangedFiles(input: {
    scope: RootScope;
    mode: GitDiffMode;
    sessionId?: string;
    base?: string;
  }): Promise<GitChangedFilesResponse>;
  gitBranchRefs(scope: RootScope): Promise<GitBranchRefsResponse>;
  /** Per-file unified diff with parsed server hunks. */
  gitDiff(input: {
    scope: RootScope;
    relPath: string;
    mode: GitDiffMode;
    sessionId?: string;
    base?: string;
  }): Promise<GitDiffResponse>;
  /** Base + working text for the Monaco DiffEditor. */
  gitFileVersion(input: {
    scope: RootScope;
    relPath: string;
    mode: GitDiffMode;
    sessionId?: string;
    base?: string;
  }): Promise<GitFileVersionResponse>;
  /** Absolute URL for streaming a base/working binary blob (auth token in the
      query) — used by image/audio/video before/after previews. */
  gitBlobVersionUrl(input: {
    scope: RootScope;
    relPath: string;
    version: "base" | "working";
    mode: GitDiffMode;
    base?: string;
  }): string;
  /** Read the effective base-ref diff settings (X5). */
  gitDiffSettings(scope: RootScope): Promise<GitDiffSettingsResponse>;
  /** Set/clear the per-project base-ref override (X5). */
  putGitDiffSettings(input: {
    pathId: string;
    diffBaseRefOverride: string | null;
  }): Promise<GitDiffSettingsResponse>;
  /** Reverse-apply a single recomputed hunk, or revert the whole file /
      rename (X3). The server recomputes the diff and never trusts client
      patch text. Throws a {@link GitRevertError} carrying the server `code`
      (notably `HUNK_CONFLICT`) on failure. */
  gitRevertHunk(
    scope: RootScope,
    input: {
      relPath: string;
      mode: GitDiffMode;
      hunkId?: string;
      action?: GitRevertAction;
      oldPath?: string;
      base?: string;
      sessionId?: string;
    },
  ): Promise<GitRevertHunkResponse>;
  listParticipants(scope?: RootScope): Promise<Record<string, Participant>>;
  registerAgent(input: {
    name: string;
    suggested_id?: string;
  }): Promise<RegisteredAgent>;
  updateParticipant(
    id: string,
    patch: UpdateParticipantPatch,
    scope?: RootScope,
  ): Promise<UpdatedParticipant>;
  getUserProfile(): Promise<UserProfile>;
  updateUserProfile(patch: UpdateUserProfilePatch): Promise<UserProfile>;
  health(): Promise<HealthInfo>;
  restartKernel(): Promise<{ status: string }>;
  listEvents(
    sessionId: string,
    scope: RootScope,
    params?: EventListParams,
  ): Promise<AnyEventRecord[]>;
  postProse(
    sessionId: string,
    body: PostProseBody,
    scope: RootScope,
  ): Promise<{ filename: string }>;
  postTurnEnd(
    sessionId: string,
    participantId: string,
    scope: RootScope,
  ): Promise<{ filename: string }>;
  postChoice(
    sessionId: string,
    body: PostChoiceBody,
    scope: RootScope,
  ): Promise<{ filename: string }>;
  postTodo(
    sessionId: string,
    body: PostTodoBody,
    scope: RootScope,
  ): Promise<{ filename: string }>;
  postHtml(
    sessionId: string,
    body: PostHtmlBody,
    scope: RootScope,
  ): Promise<{ filename: string }>;
  postFlow(
    sessionId: string,
    body: PostFlowBody,
    scope: RootScope,
  ): Promise<{ filename: string }>;
  postFile(
    sessionId: string,
    body: PostFileBody,
    scope: RootScope,
  ): Promise<{ filename: string }>;
  ensureManagedAgents(
    sessionId: string,
    scope: RootScope,
    body?: Omit<EnsureManagedAgentsRequest, "path_id" | "root">,
  ): Promise<EnsureManagedAgentsResponse>;
  uploadAttachment(
    sessionId: string,
    input: UploadAttachmentInput,
    scope?: RootScope,
  ): Promise<UploadAttachmentResponse>;
  /** Remove a staged (un-committed) attachment from disk. Resolves on
   *  204 (deleted) or on 409 (already committed — chip should still
   *  drop locally, the file remains on disk for the committed event). */
  deleteAttachment(
    sessionId: string,
    fileId: string,
    scope?: RootScope,
  ): Promise<void>;
  listTodos(sessionId: string, assignedTo?: string): Promise<TodoListResponse>;
  listTodos(
    sessionId: string,
    scope?: RootScope,
    assignedTo?: string,
  ): Promise<TodoListResponse>;
  todoDescendants(
    sessionId: string,
    todoId: string,
    scope: RootScope,
  ): Promise<string[]>;
  search(
    query: string,
    sessionId?: string,
    scope?: "all",
    limit?: number,
  ): Promise<SearchHit[]>;
  listPresets(sessionId?: string): Promise<{ builtin: Preset[]; project: Preset[] }>;
  /* Returns the union of skills scanned from `.claude/skills`,
     `.codex/skills`, `.opencode/skills`, and `.skills/` walking upward from the
     server's CWD. When `agent` is set, only that agent's directory + the
     generic `.skills` are scanned. See kernel/skills/scanner.ts. */
  listSkills(agent?: string): Promise<{ skills: SkillRef[] }>;
  getSkillFile(path: string): Promise<SkillFile>;
  saveSkillFile(input: {
    path: string;
    name: string;
    description: string;
    args?: string;
    body: string;
  }): Promise<SkillFile>;
}

export function createClient(cfg: ClientConfig): Client {
  const http = createHttpClient(cfg);
  return {
    ...createSessionMethods(http),
    ...createPathMethods(http),
    ...createFileMethods(http),
    ...createGitMethods(http),
    ...createIdentityMethods(http),
    ...createEventMethods(http),
    ...createDiscoveryMethods(http),
  };
}
