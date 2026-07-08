import type { AnyEventRecord } from "@f-mark/shared";

export const REPO_A = {
  path: "/repo-a",
  pathId: "repo-a-id",
} as const;

export const REPO_B = {
  path: "/repo-b",
  pathId: "repo-b-id",
} as const;

const LEGACY_REPO = {
  path: "/legacy-default",
  pathId: "legacy-id",
} as const;

export const PARTICIPANTS = {
  "us-a7f3": { kind: "user", name: "Roey", color: "#2a5fa8" },
};

export const SELECTED_EVENT: AnyEventRecord = {
  filename: "20260526T100000.000Z_us-a7f3.prose.md",
  timestamp: "2026-05-26T10:00:00.000Z",
  participant_id: "us-a7f3",
  kind: "prose",
  payload: { content: "selected root event" },
};

const OTHER_EVENT: AnyEventRecord = {
  filename: "20260526T090000.000Z_us-a7f3.prose.md",
  timestamp: "2026-05-26T09:00:00.000Z",
  participant_id: "us-a7f3",
  kind: "prose",
  payload: { content: "other root event" },
};

type ScopedRepo = typeof REPO_A | typeof REPO_B | typeof LEGACY_REPO;

function registeredPath(repo: ScopedRepo): Record<string, unknown> {
  return { path: repo.path, path_id: repo.pathId, registered: true };
}

export function sessionFixture(
  id: string,
  repo: ScopedRepo,
  createdAt: string,
): Record<string, unknown> {
  return {
    id,
    slug: id,
    created_at: createdAt,
    path: repo.path,
    path_id: repo.pathId,
  };
}

export function multiRepoPathsPayload(
  activeRepo: ScopedRepo,
  activeRevision: number,
): Record<string, unknown> {
  return {
    paths: [registeredPath(REPO_A), registeredPath(REPO_B)],
    fallbackPath: REPO_A.path,
    fallbackPathId: REPO_A.pathId,
    activePath: activeRepo.path,
    activePathId: activeRepo.pathId,
    activeRevision,
    knownPaths: [REPO_A.path, REPO_B.path],
    favorites: [],
  };
}

export function repoBOnlyPathsPayload(): Record<string, unknown> {
  return {
    paths: [registeredPath(REPO_B)],
    fallbackPath: REPO_B.path,
    fallbackPathId: REPO_B.pathId,
    activePath: REPO_B.path,
    activePathId: REPO_B.pathId,
    activeRevision: 7,
    knownPaths: [REPO_B.path],
    favorites: [],
  };
}

export function legacyPathsPayload(): Record<string, unknown> {
  return {
    activePath: LEGACY_REPO.path,
    activePathId: LEGACY_REPO.pathId,
    activeRevision: 1,
    knownPaths: [LEGACY_REPO.path, REPO_B.path],
    favorites: [],
  };
}

export function eventsPayload(event: AnyEventRecord): Record<string, unknown> {
  return { events: [event] };
}
