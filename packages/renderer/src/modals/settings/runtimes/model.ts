import {
  isOfferableRuntimeId,
  type RuntimeEntry,
} from "@f-mark/shared";
import {
  avatarKind,
} from "../../../components/ParticipantAvatar.js";

const NO_LOOSE_STRING_VALUES = {
  closed: "closed",
  bot: "bot",
  value1500: "1500",
  agent: "agent",
  add: "add",
} as const;

export const ICON_CHOICES = ["bot", "claude", "codex", "opencode"] as const;
export type IconName = (typeof ICON_CHOICES)[number];

const ID_RE = /^[a-z][a-z0-9_-]{0,31}$/;
const EXEC_RE = /^[a-zA-Z0-9_./-]+$/;
const ENV_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/* The kernel ships these IDs as builtins (see
   packages/kernel/src/runtimes/defaults.ts). Anything else is "custom". */
const BUILTIN_IDS = new Set(["claude", "codex", "opencode"]);

export interface RuntimeFormState {
  /* `closed` hides the form; add/edit render the inline editor. */
  mode: "add" | "edit" | "closed";
  editingId: string | null;
  id: string;
  displayName: string;
  executable: string;
  argsText: string;
  envText: string;
  icon: IconName;
  readyDelayMs: string;
}

export interface RuntimeRowModel {
  id: string;
  entry: RuntimeEntry;
  builtin: boolean;
}

export type RuntimeFormResult =
  | { ok: true; entry: RuntimeEntry }
  | { ok: false; error: string };

export function closedRuntimeForm(): RuntimeFormState {
  return {
    mode: NO_LOOSE_STRING_VALUES.closed,
    editingId: null,
    id: "",
    displayName: "",
    executable: "",
    argsText: "",
    envText: "",
    icon: NO_LOOSE_STRING_VALUES.bot,
    readyDelayMs: NO_LOOSE_STRING_VALUES.value1500,
  };
}

export function asIcon(v: string): IconName {
  return (ICON_CHOICES as readonly string[]).includes(v)
    ? (v as IconName)
    : NO_LOOSE_STRING_VALUES.bot;
}

export function buildRuntimeRows(
  runtimes: Record<string, RuntimeEntry>,
): RuntimeRowModel[] {
  return Object.entries(runtimes)
    .filter(([id]) => isOfferableRuntimeId(id))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, entry]) => ({
      id,
      entry,
      builtin: BUILTIN_IDS.has(id),
    }));
}

export function runtimeIconKind(
  icon: string | undefined,
  id: string,
  entry: RuntimeEntry,
): ReturnType<typeof avatarKind> {
  return avatarKind({
    kind: NO_LOOSE_STRING_VALUES.agent,
    runtimeId: icon === NO_LOOSE_STRING_VALUES.bot ? id : (icon ?? id),
    name: entry.displayName,
  });
}

export function formatEnv(env: RuntimeEntry["env"]): string {
  if (env === undefined) return "";
  return Object.entries(env)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
}

function parseArgs(text: string): string[] {
  const trimmed = text.trim();
  if (trimmed.length === 0) return [];
  return trimmed.split(/\s+/);
}

function parseEnvText(text: string): Record<string, string> | undefined {
  const env: Record<string, string> = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) {
      throw new Error("Env entries must use KEY=value lines.");
    }
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1);
    if (!ENV_KEY_RE.test(key)) {
      throw new Error(
        "Env keys must start with a letter or underscore and contain only letters, digits, and underscores.",
      );
    }
    env[key] = value;
  }
  return Object.keys(env).length > 0 ? env : undefined;
}

export function runtimeEntryFromForm(
  form: RuntimeFormState,
): RuntimeFormResult {
  if (form.mode === NO_LOOSE_STRING_VALUES.add && !ID_RE.test(form.id)) {
    return {
      ok: false,
      error:
        "Invalid id: must match ^[a-z][a-z0-9_-]{0,31}$ (lowercase, starts with a letter).",
    };
  }
  if (form.mode === NO_LOOSE_STRING_VALUES.add && !isOfferableRuntimeId(form.id)) {
    return { ok: false, error: "This runtime is no longer supported." };
  }
  if (form.displayName.trim().length === 0) {
    return { ok: false, error: "Display name is required." };
  }
  if (!EXEC_RE.test(form.executable)) {
    return {
      ok: false,
      error:
        "Invalid executable: must match ^[a-zA-Z0-9_./-]+$ (letters, digits, _ . / -).",
    };
  }
  const readyDelayMs = Number(form.readyDelayMs);
  if (!Number.isFinite(readyDelayMs) || readyDelayMs < 0) {
    return { ok: false, error: "readyDelayMs must be a non-negative number." };
  }

  let env: Record<string, string> | undefined;
  try {
    env = parseEnvText(form.envText);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  return {
    ok: true,
    entry: {
      displayName: form.displayName.trim(),
      executable: form.executable,
      args: parseArgs(form.argsText),
      icon: form.icon,
      readyDelayMs,
      ...(env !== undefined ? { env } : {}),
    },
  };
}
