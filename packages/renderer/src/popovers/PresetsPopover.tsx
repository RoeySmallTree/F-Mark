/* PresetsPopover — anchored over the compose bar's ⚡ Presets button (P8).
   Lists presets grouped by user-defined categories (seeded with Generate
   / Critique / Format on first run). Project presets render in a separate
   "Project" group at the bottom regardless of their `group` field.

   Picking a preset:
     1. Writes the preset body to store.composeDraft.
     2. Closes the popover.
     3. Compose.tsx watches composeDraft, appends/replaces, then clears it
        (a useEffect; see compose/Compose.tsx step 4).

   Workspace gating (two-tier intersection):
     - A category is visible when its `workspaces` array is empty or
       includes the current active path.
     - A preset is visible when its category is visible AND its own
       `workspaces` array is empty or includes the current active path.
     - Presets whose `group` doesn't match any existing category fall
       into a synthetic "Uncategorized" bucket rendered at the bottom
       (above the Project group). Uncategorized is always visible
       everywhere — there's no category record to gate it.

   The search input filters by case-insensitive substring against both
   `name` and `body`. */

import { useEffect, useMemo, useState, type JSX } from "react";
import { Search, Zap, Plus } from "lucide-react";
import type { Preset } from "@f-mark/shared";
import { createClient } from "../api/client.js";
import { useStore } from "../state/store.js";
import { chordToLabel } from "../modals/settings/shortcut-registry.js";
import { Popover } from "./Popover.js";
import { PresetItem } from "./PresetItem.js";
import {
  loadCustomPresets,
  toPreset,
} from "./customPresets.js";
import {
  loadCustomCategories,
  type CustomCategory,
} from "./customCategories.js";

interface Props {
  anchorRect: DOMRect | null;
  onClose(): void;
}

const PRESETS_SHORTCUT = chordToLabel("$mod+P");

const UNCATEGORIZED_KEY = "__uncategorized__";

function caseInsensitiveSubstring(p: Preset, needle: string): boolean {
  if (needle.length === 0) return true;
  const q = needle.toLowerCase();
  return (
    p.name.toLowerCase().includes(q) || p.body.toLowerCase().includes(q)
  );
}

function categoryVisible(
  cat: CustomCategory,
  activePath: string | null,
): boolean {
  if (cat.workspaces.length === 0) return true;
  if (activePath === null) return false;
  return cat.workspaces.includes(activePath);
}

function presetVisible(
  p: Preset,
  activePath: string | null,
): boolean {
  if (p.workspaces === undefined || p.workspaces.length === 0) return true;
  if (activePath === null) return false;
  return p.workspaces.includes(activePath);
}

export function PresetsPopover({ anchorRect, onClose }: Props): JSX.Element {
  const token = useStore((s) => s.token);
  const sessionId = useStore((s) => s.currentSessionId);
  const setComposeDraft = useStore((s) => s.setComposeDraft);
  const openPresetEditor = useStore((s) => s.openPresetEditor);
  const customPresetsVersion = useStore((s) => s.customPresetsVersion);
  const customCategoriesVersion = useStore((s) => s.customCategoriesVersion);
  const activePath = useStore((s) => s.activePath);

  const [builtin, setBuiltin] = useState<Preset[]>([]);
  const [project, setProject] = useState<Preset[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const client = createClient({ baseUrl: "", token });
    void (async () => {
      try {
        const res = await client.listPresets(sessionId ?? undefined);
        if (cancelled) return;
        setBuiltin(res.builtin);
        setProject(res.project);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, sessionId]);

  /* Re-read custom presets whenever the editor bumps the version. */
  const custom = useMemo(
    () => loadCustomPresets().map(toPreset),
    [customPresetsVersion],
  );

  /* Re-read categories whenever the editor bumps the version. */
  const categories = useMemo<CustomCategory[]>(
    () => loadCustomCategories(),
    [customCategoriesVersion],
  );

  /* Group all built-in + custom presets by category id. Filter by
     workspace gating (intersection at category + preset level). The
     project list is rendered separately, untouched by category gating
     beyond per-preset workspaces. */
  const grouped = useMemo<
    Array<{ category: CustomCategory | null; presets: Preset[] }>
  >(() => {
    const visibleCats = categories.filter((c) =>
      categoryVisible(c, activePath),
    );
    const known = new Set(categories.map((c) => c.id));
    const combined = [...builtin, ...custom].filter((p) =>
      caseInsensitiveSubstring(p, query),
    );

    const byCat = new Map<string, Preset[]>();
    const orphans: Preset[] = [];
    for (const p of combined) {
      if (!known.has(p.group)) {
        orphans.push(p);
        continue;
      }
      const list = byCat.get(p.group) ?? [];
      list.push(p);
      byCat.set(p.group, list);
    }

    const out: Array<{ category: CustomCategory | null; presets: Preset[] }> = [];
    for (const c of visibleCats) {
      const items = (byCat.get(c.id) ?? []).filter((p) =>
        presetVisible(p, activePath),
      );
      if (items.length > 0) out.push({ category: c, presets: items });
    }
    /* Uncategorized last (still before Project). Preset-level workspaces
       still gate orphan presets. */
    const visibleOrphans = orphans.filter((p) => presetVisible(p, activePath));
    if (visibleOrphans.length > 0) {
      out.push({ category: null, presets: visibleOrphans });
    }
    return out;
  }, [categories, builtin, custom, query, activePath]);

  const filteredProject = useMemo(
    () =>
      project.filter(
        (p) =>
          caseInsensitiveSubstring(p, query) && presetVisible(p, activePath),
      ),
    [project, query, activePath],
  );

  const hasResults = grouped.length > 0 || filteredProject.length > 0;

  function onAddPreset(): void {
    /* Pass `null` to mean "create new" — the modal allocates the id. */
    openPresetEditor(null);
  }

  function onEditPreset(preset: Preset): void {
    if (preset.source !== "custom") return;
    const all = loadCustomPresets();
    const match = all.find((c) => c.id === preset.path);
    if (match === undefined) return;
    openPresetEditor(match);
  }

  function onPick(preset: Preset): void {
    setComposeDraft(preset.body);
    onClose();
    /* Focus the compose textarea after the popover unmounts. Compose owns
       the textarea; we cannot reach it from here without a ref/event. The
       Compose useEffect that consumes composeDraft also focuses; the
       store-driven path keeps the wiring decoupled. */
  }

  return (
    <Popover
      anchorRect={anchorRect}
      placement="top-end"
      onClose={onClose}
      className="presets-pop"
      ariaLabel="Presets"
    >
      <div className="pop-head">
        <Zap size={14} aria-hidden style={{ color: "var(--ink-2)" }} />
        Presets
        <button
          type="button"
          className="pop-head-add"
          onClick={onAddPreset}
          aria-label="Create new preset"
          title="Create new preset"
        >
          <Plus size={13} aria-hidden />
        </button>
        <span
          style={{
            marginLeft: 6,
            fontFamily: "var(--mono)",
            fontSize: 10.5,
            color: "var(--ink-4)",
          }}
        >
          {PRESETS_SHORTCUT}
        </span>
      </div>

      <div className="presets-search">
        <Search size={12} aria-hidden style={{ color: "var(--ink-4)" }} />
        <input
          autoFocus
          type="text"
          placeholder="Search presets…"
          aria-label="Search presets"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="presets-list" data-testid="presets-list">
        {loading ? (
          <div className="presets-empty">Loading…</div>
        ) : error !== null ? (
          <div
            className="presets-empty"
            role="alert"
            style={{ color: "var(--rose)" }}
          >
            Couldn’t load presets: {error}
          </div>
        ) : !hasResults ? (
          <div className="presets-empty">
            {query.length > 0
              ? "No presets match that search."
              : "No presets available."}
          </div>
        ) : (
          <>
            {grouped.map(({ category, presets }) => {
              const key = category?.id ?? UNCATEGORIZED_KEY;
              const label = category?.name ?? "Uncategorized";
              return (
                <div
                  key={key}
                  data-testid={`presets-group-${key}`}
                >
                  <div className="presets-group">{label}</div>
                  {presets.map((p) => (
                    <PresetItem
                      key={p.path}
                      preset={p}
                      onPick={onPick}
                      onEdit={p.source === "custom" ? onEditPreset : undefined}
                    />
                  ))}
                </div>
              );
            })}
            {filteredProject.length > 0 ? (
              <div data-testid="presets-group-project">
                <div className="presets-group">Project</div>
                {filteredProject.map((p) => (
                  <PresetItem key={p.path} preset={p} onPick={onPick} />
                ))}
              </div>
            ) : null}
          </>
        )}
      </div>

      <div
        className="pop-foot"
        style={{
          justifyContent: "space-between",
          fontFamily: "var(--mono)",
          fontSize: 10.5,
          color: "var(--ink-4)",
        }}
      >
        <span>Pre-fills compose — edit before sending</span>
        <span aria-hidden style={{ opacity: 0.7 }}>
          esc to close
        </span>
      </div>
    </Popover>
  );
}
