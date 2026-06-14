/* customCategories — renderer-local preset-category store.

   Categories define how presets are grouped in the popover (Generate /
   Critique / Format and any user-defined groups). They live in
   localStorage alongside customPresets and are first-class user data:
   editable, deletable, reorderable.

   On first read, the store seeds three "built-in shaped" categories
   (`generate`, `critique`, `format`) so kernel-shipped builtin presets
   land in their conventional buckets without any migration. After the
   seed, every category is just a regular user-owned record.

   Workspaces (absolute paths) on a category gate its visibility at the
   container level. Empty array = visible everywhere. Per-preset
   workspaces further gate individual presets inside a visible category
   (see customPresets.ts).

   Storage key: `fmark:settings:custom-categories` → JSON-encoded
   CustomCategory[]. */

export const CUSTOM_CATEGORIES_STORAGE_KEY =
  "fmark:settings:custom-categories";

export interface CustomCategory {
  /* Primary key. Used as Preset.group so the popover can pair a preset
     with its category. For the seeded trio this is "generate" /
     "critique" / "format"; for user-created categories it's a generated
     id like "cat-{ts}-{rand}". */
  id: string;
  /* Display label shown in the seg-control / popover headers. */
  name: string;
  /* Curated emoji pool the preset editor's emoji picker draws from when
     a preset is in this category. Empty pool = the picker only shows the
     freeform input. */
  emojis: string[];
  /* Absolute paths. Empty array = visible everywhere. */
  workspaces: string[];
  /* Sort key. Lower → earlier. */
  order: number;
}

const SEED_CATEGORIES: ReadonlyArray<CustomCategory> = [
  {
    id: "generate",
    name: "Generate",
    emojis: ["✨", "📐", "🔀", "🪄", "🎯", "🧱", "📋", "🧪", "🛠", "🌱"],
    workspaces: [],
    order: 0,
  },
  {
    id: "critique",
    name: "Critique",
    emojis: ["🧐", "❓", "⚠️", "🚩", "💭", "🤔", "🕳", "👁", "🪤", "🩻"],
    workspaces: [],
    order: 1,
  },
  {
    id: "format",
    name: "Format",
    emojis: ["✂️", "🪨", "🧽", "🔍", "🎚", "📏", "🧹", "🪞", "⚖️", "🔬"],
    workspaces: [],
    order: 2,
  },
];

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

function isCustomCategory(v: unknown): v is CustomCategory {
  if (v === null || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    typeof r.name === "string" &&
    typeof r.order === "number" &&
    isStringArray(r.emojis) &&
    isStringArray(r.workspaces)
  );
}

/* Tracks whether we've already seeded so a user who has deliberately
   emptied the list doesn't get the trio re-injected on next read. */
const SEED_MARKER_KEY = "fmark:settings:custom-categories-seeded";

function markSeeded(): void {
  try {
    globalThis.localStorage?.setItem(SEED_MARKER_KEY, "1");
  } catch {
    /* ignore */
  }
}

function hasBeenSeeded(): boolean {
  try {
    return globalThis.localStorage?.getItem(SEED_MARKER_KEY) === "1";
  } catch {
    return false;
  }
}

function saveAll(items: CustomCategory[]): void {
  try {
    globalThis.localStorage?.setItem(
      CUSTOM_CATEGORIES_STORAGE_KEY,
      JSON.stringify(items),
    );
  } catch {
    /* ignore */
  }
}

export function loadCustomCategories(): CustomCategory[] {
  let parsed: unknown = null;
  try {
    const raw = globalThis.localStorage?.getItem(
      CUSTOM_CATEGORIES_STORAGE_KEY,
    );
    if (raw !== null && raw !== undefined) {
      parsed = JSON.parse(raw);
    }
  } catch {
    parsed = null;
  }
  if (Array.isArray(parsed)) {
    const valid = parsed.filter(isCustomCategory);
    valid.sort((a, b) => a.order - b.order);
    return valid;
  }
  /* Nothing stored. Seed once and persist so the user sees a populated
     editor on first open. If they later empty the list, the seed marker
     prevents re-seeding. */
  if (hasBeenSeeded()) return [];
  const seed = SEED_CATEGORIES.map((c) => ({ ...c }));
  saveAll(seed);
  markSeeded();
  return seed;
}

export function upsertCustomCategory(c: CustomCategory): void {
  const all = loadCustomCategories();
  const idx = all.findIndex((x) => x.id === c.id);
  if (idx >= 0) {
    all[idx] = c;
  } else {
    all.push(c);
  }
  all.sort((a, b) => a.order - b.order);
  saveAll(all);
  markSeeded();
}

export function removeCustomCategory(id: string): void {
  const all = loadCustomCategories().filter((x) => x.id !== id);
  saveAll(all);
  markSeeded();
}

export function newCustomCategoryId(): string {
  const r = Math.random().toString(36).slice(2, 8);
  return `cat-${Date.now().toString(36)}-${r}`;
}

/* Compute the next available order key so newly-added categories land
   at the end of the list. */
export function nextCategoryOrder(): number {
  const all = loadCustomCategories();
  if (all.length === 0) return 0;
  return Math.max(...all.map((c) => c.order)) + 1;
}
