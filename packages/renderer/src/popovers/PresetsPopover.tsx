/* PresetsPopover — anchored over the compose bar's ⚡ Presets button (P8).
   Lists built-in presets grouped by `generate` / `critique` / `format`, plus
   a "Project" group when project-local presets exist for the current session.

   Picking a preset:
     1. Writes the preset body to store.composeDraft.
     2. Closes the popover.
     3. Compose.tsx watches composeDraft, appends/replaces, then clears it
        (a useEffect; see compose/Compose.tsx step 4).

   The search input filters by a simple case-insensitive substring against
   both `name` and `body`. (Inline because P7's fuzzy.ts is not yet shipped.) */

import { useEffect, useMemo, useState, type JSX } from "react";
import { Search, Zap } from "lucide-react";
import type { Preset, PresetGroup } from "@f-mark/shared";
import { createClient } from "../api/client.js";
import { useStore } from "../state/store.js";
import { Popover } from "./Popover.js";
import { PresetItem } from "./PresetItem.js";

interface Props {
  anchorRect: DOMRect | null;
  onClose(): void;
}

/* Fixed ordering of built-in groups per the prompt. Project presets come
   last as a separate group regardless of their `group` field. */
const GROUP_ORDER: PresetGroup[] = ["generate", "critique", "format"];

const GROUP_LABELS: Record<PresetGroup, string> = {
  generate: "Generate",
  critique: "Critique",
  format: "Format",
};

function caseInsensitiveSubstring(p: Preset, needle: string): boolean {
  if (needle.length === 0) return true;
  const q = needle.toLowerCase();
  return (
    p.name.toLowerCase().includes(q) || p.body.toLowerCase().includes(q)
  );
}

function groupBuiltins(items: Preset[]): Array<[PresetGroup, Preset[]]> {
  const out: Array<[PresetGroup, Preset[]]> = [];
  for (const g of GROUP_ORDER) {
    const matched = items.filter((p) => p.group === g);
    if (matched.length > 0) out.push([g, matched]);
  }
  return out;
}

export function PresetsPopover({ anchorRect, onClose }: Props): JSX.Element {
  const token = useStore((s) => s.token);
  const sessionId = useStore((s) => s.currentSessionId);
  const setComposeDraft = useStore((s) => s.setComposeDraft);

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

  const filteredBuiltin = useMemo(
    () => builtin.filter((p) => caseInsensitiveSubstring(p, query)),
    [builtin, query],
  );
  const filteredProject = useMemo(
    () => project.filter((p) => caseInsensitiveSubstring(p, query)),
    [project, query],
  );
  const groupedBuiltin = useMemo(
    () => groupBuiltins(filteredBuiltin),
    [filteredBuiltin],
  );
  const hasResults =
    groupedBuiltin.length > 0 || filteredProject.length > 0;

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
        <span
          style={{
            marginLeft: "auto",
            fontFamily: "var(--mono)",
            fontSize: 10.5,
            color: "var(--ink-4)",
          }}
        >
          ⌘P
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
            {groupedBuiltin.map(([group, items]) => (
              <div key={group} data-testid={`presets-group-${group}`}>
                <div className="presets-group">{GROUP_LABELS[group]}</div>
                {items.map((p) => (
                  <PresetItem key={p.path} preset={p} onPick={onPick} />
                ))}
              </div>
            ))}
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
