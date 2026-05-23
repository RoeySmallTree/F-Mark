/* customPresets — renderer-local preset store.

   Built-in presets ship as markdown files served by the kernel. Project
   presets ditto. User-defined "custom" presets live in localStorage so
   they survive reloads without needing a kernel write path.

   Storage key: `fmark:settings:custom-presets` → JSON-encoded
   CustomPreset[]. Each entry carries a stable client-generated id (used
   as Preset.path), the user-chosen name + body + emoji, and a group
   (CRITIQUE / GENERATE / FORMAT) that lets the popover slot it next to
   the matching built-ins.

   The popover reads via `loadCustomPresets()` once on open; the editor
   modal calls `upsertCustomPreset` / `removeCustomPreset` and bumps the
   `customPresetsVersion` so listeners can re-render. */

import type { Preset, PresetGroup } from "@f-mark/shared";

export const CUSTOM_PRESETS_STORAGE_KEY = "fmark:settings:custom-presets";

export interface CustomPreset {
  id: string;
  name: string;
  group: PresetGroup;
  icon: string;
  body: string;
}

function isPresetGroup(v: unknown): v is PresetGroup {
  return v === "generate" || v === "critique" || v === "format";
}

function isCustomPreset(v: unknown): v is CustomPreset {
  if (v === null || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    typeof r.name === "string" &&
    typeof r.body === "string" &&
    typeof r.icon === "string" &&
    isPresetGroup(r.group)
  );
}

export function loadCustomPresets(): CustomPreset[] {
  try {
    const raw = globalThis.localStorage?.getItem(CUSTOM_PRESETS_STORAGE_KEY);
    if (raw === null || raw === undefined) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isCustomPreset);
  } catch {
    return [];
  }
}

function saveAll(items: CustomPreset[]): void {
  try {
    globalThis.localStorage?.setItem(
      CUSTOM_PRESETS_STORAGE_KEY,
      JSON.stringify(items),
    );
  } catch {
    /* localStorage may be disabled / full — swallow silently. */
  }
}

export function upsertCustomPreset(p: CustomPreset): void {
  const all = loadCustomPresets();
  const idx = all.findIndex((x) => x.id === p.id);
  if (idx >= 0) {
    all[idx] = p;
  } else {
    all.push(p);
  }
  saveAll(all);
}

export function removeCustomPreset(id: string): void {
  const all = loadCustomPresets().filter((x) => x.id !== id);
  saveAll(all);
}

/* Cheap unique id — timestamp + random suffix is plenty for client-side
   identifiers; we never round-trip these to a server. */
export function newCustomPresetId(): string {
  const r = Math.random().toString(36).slice(2, 8);
  return `custom-${Date.now().toString(36)}-${r}`;
}

/* Convert a CustomPreset into the canonical Preset shape used by the
   popover so it renders alongside builtin / project entries without
   special-casing the row component. */
export function toPreset(c: CustomPreset): Preset {
  return {
    name: c.name,
    group: c.group,
    icon: c.icon,
    body: c.body,
    source: "custom",
    path: c.id,
  };
}
