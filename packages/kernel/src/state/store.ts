import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { GlobalPaths } from "../paths/global.js";

export interface Favorite {
  name: string;
  path: string;
}

export interface KernelState {
  activePath: string | null;
  activeRevision: number;
  knownPaths: string[];
  favorites: Favorite[];
}

const DEFAULT_STATE: KernelState = {
  activePath: null,
  activeRevision: 0,
  knownPaths: [],
  favorites: [],
};

const KNOWN_PATHS_CAP = 20;

export async function readState(g: GlobalPaths): Promise<KernelState> {
  try {
    const raw = await readFile(g.stateFile(), "utf8");
    const parsed = JSON.parse(raw) as Partial<KernelState>;
    return normalize(parsed);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { ...DEFAULT_STATE };
    }
    throw err;
  }
}

/* Atomic write via tmp + rename so a crash mid-write can't leave a torn
   state.json behind. Callers serialize updates via a single in-process
   mutator (see updateState below) so concurrent writes from two routes
   can't lose data. */
export async function writeState(g: GlobalPaths, state: KernelState): Promise<void> {
  const target = g.stateFile();
  await mkdir(dirname(target), { recursive: true });
  const tmp = `${target}.tmp`;
  await writeFile(tmp, JSON.stringify(state, null, 2), "utf8");
  await rename(tmp, target);
}

let mutex: Promise<void> = Promise.resolve();

async function acquire(): Promise<() => void> {
  let release!: () => void;
  const next = new Promise<void>((res) => { release = res; });
  const prev = mutex;
  mutex = next;
  await prev;
  return release;
}

export async function updateState(
  g: GlobalPaths,
  mutator: (state: KernelState) => KernelState,
): Promise<KernelState> {
  const release = await acquire();
  try {
    const current = await readState(g);
    const next = mutator(current);
    await writeState(g, next);
    return next;
  } finally {
    release();
  }
}

function normalize(input: Partial<KernelState>): KernelState {
  const activePath =
    typeof input.activePath === "string" ? input.activePath : null;
  const knownPaths = Array.isArray(input.knownPaths)
    ? input.knownPaths.filter((p): p is string => typeof p === "string")
    : [];
  /* activePath is now a deprecated/default-root hint, not the kernel's
     authoritative runtime root. Keep old state.json files useful by making
     the legacy activePath visible in the registry-backed knownPaths list. */
  const normalizedKnownPaths =
    activePath !== null && !knownPaths.includes(activePath)
      ? [activePath, ...knownPaths]
      : knownPaths;
  return {
    activePath,
    activeRevision: typeof input.activeRevision === "number" ? input.activeRevision : 0,
    knownPaths: normalizedKnownPaths,
    favorites: Array.isArray(input.favorites)
      ? input.favorites.filter(
          (f): f is Favorite =>
            typeof f === "object" &&
            f !== null &&
            typeof (f as Favorite).name === "string" &&
            typeof (f as Favorite).path === "string",
        )
      : [],
  };
}

/* MRU push: move `path` to the front of knownPaths and cap at KNOWN_PATHS_CAP. */
export function mruPush(state: KernelState, path: string): KernelState {
  const filtered = state.knownPaths.filter((p) => p !== path);
  filtered.unshift(path);
  return { ...state, knownPaths: filtered.slice(0, KNOWN_PATHS_CAP) };
}

export function bumpRevision(state: KernelState): KernelState {
  return { ...state, activeRevision: state.activeRevision + 1 };
}
