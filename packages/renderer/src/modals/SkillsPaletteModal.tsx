/* SkillsPaletteModal — invoke project-scoped commands/skills (P9).

   Mounted by ModalRoot when `store.activeModal === 'skills'`. Opens via
   `$mod+Shift+K` (registered by Compose while the main layout is mounted).
   Visually extends
   the cmdk frame (`.cmdk` + `.cmdk-input-row` + `.cmdk-results` +
   `.cmdk-foot`) and adds `.skills-pal` so the design.html
   `.skills-pal .skill-row` overrides apply.

   Behavior:
     - Fetches `/skills?agent=<activeAgent>` on open (and on agent change).
     - Groups results by `agent` via groupByAgent().
     - Fuzzy filter by name+description as the user types.
     - Arrow keys navigate (with wrap-around), Enter activates.
     - Activate → store.setComposeDraft(`/skill-name <args>`) then closeModal();
       the Compose useEffect (P8) consumes the draft and focuses the textarea.
     - The agent dropdown at the top switches which agent dir we scan; the
       choice persists to localStorage via writeStoredActiveAgent. */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
} from "react";
import { Sparkles, Terminal } from "lucide-react";
import type { SkillRef } from "@f-mark/shared";
import { createClient } from "../api/client.js";
import { useStore } from "../state/store.js";
import {
  AGENT_LABELS,
  KNOWN_AGENT_KEYS,
  resolveActiveAgent,
  writeStoredActiveAgent,
  type AgentKey,
} from "./skills/active-agent.js";
import {
  filterSkills,
  flattenSkills,
  groupByAgent,
  insertionFor,
} from "./skills/sources.js";

/* Lucide icon for the row leading mark. We default to Sparkles; some skills
   look "tool-y" enough to use Terminal (anything whose name contains
   "review", "audit", "lint", "compile", "build", "deploy"). It's a tiny
   visual lift — purely cosmetic. */
function iconFor(skill: SkillRef): JSX.Element {
  const n = skill.name.toLowerCase();
  const TOOL_HINTS = ["review", "audit", "lint", "compile", "build", "deploy"];
  if (TOOL_HINTS.some((h) => n.includes(h))) {
    return <Terminal size={13} aria-hidden />;
  }
  return <Sparkles size={13} aria-hidden />;
}

/* Short agent shorthand for the right-edge kbd badge. */
const AGENT_BADGE: Record<NonNullable<AgentKey>, string> = {
  claude: "cla",
  codex: "cdx",
  gemini: "gem",
  generic: "any",
};

export function SkillsPaletteModal(): JSX.Element {
  const token = useStore((s) => s.token);
  const participants = useStore((s) => s.participants);
  const setComposeDraft = useStore((s) => s.setComposeDraft);
  const closeModal = useStore((s) => s.closeModal);

  /* The active agent — initialized from localStorage / derivation; updated
     when the user picks a different option in the dropdown. */
  const [activeAgent, setActiveAgent] = useState<AgentKey>(() =>
    resolveActiveAgent(participants),
  );

  const [skills, setSkills] = useState<SkillRef[]>([]);
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const resultsRef = useRef<HTMLDivElement | null>(null);
  /* True when selectedIdx was last changed by the keyboard (↑/↓). Reset on
     mouse hover so hovering a row doesn't trigger auto-scroll. */
  const scrollIntoViewOnNext = useRef(false);

  /* Fetch skills whenever activeAgent changes. We pass `undefined` (no
     filter) only when activeAgent itself is null — which currently never
     happens (resolveActiveAgent always returns something) but keeps the
     plumbing honest. */
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const client = createClient({ baseUrl: "", token });
    void (async () => {
      try {
        const res = await client.listSkills(activeAgent ?? undefined);
        if (cancelled) return;
        setSkills(res.skills);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setSkills([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeAgent, token]);

  /* Autofocus the search input on mount so typing works immediately. */
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const filtered = useMemo(() => filterSkills(skills, query.trim()), [
    skills,
    query,
  ]);
  const groups = useMemo(() => groupByAgent(filtered), [filtered]);
  const flatRows = useMemo(() => flattenSkills(groups), [groups]);

  /* Reset selection when the result set changes — same pattern as cmdk. */
  useEffect(() => {
    setSelectedIdx(0);
  }, [groups]);

  /* Keep the selected row in view when the keyboard moves selection. We
     skip the scroll when the change came from a mouse hover (the row is
     already under the cursor — scrolling it would chase the pointer). */
  useEffect(() => {
    if (!scrollIntoViewOnNext.current) return;
    scrollIntoViewOnNext.current = false;
    const container = resultsRef.current;
    if (container === null) return;
    const el = container.querySelector(
      `[data-skill-idx="${selectedIdx}"]`,
    ) as HTMLElement | null;
    if (el === null) return;
    /* offsetTop is relative to the offsetParent — which is not necessarily
       the scroll container. Compute a container-relative offset via the
       bounding rects, which is what we actually want for scroll math. */
    const elRect = el.getBoundingClientRect();
    const ctRect = container.getBoundingClientRect();
    const top = elRect.top - ctRect.top + container.scrollTop;
    const bottom = top + el.offsetHeight;
    const viewTop = container.scrollTop;
    const viewBottom = viewTop + container.clientHeight;
    if (top < viewTop) {
      container.scrollTop = top - 4;
    } else if (bottom > viewBottom) {
      container.scrollTop = bottom - container.clientHeight + 4;
    }
  }, [selectedIdx]);

  const activate = useCallback(
    (skill: SkillRef): void => {
      setComposeDraft(insertionFor(skill));
      closeModal();
    },
    [setComposeDraft, closeModal],
  );

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (flatRows.length === 0) return;
      scrollIntoViewOnNext.current = true;
      setSelectedIdx((i) => (i + 1) % flatRows.length);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (flatRows.length === 0) return;
      scrollIntoViewOnNext.current = true;
      setSelectedIdx((i) => (i - 1 + flatRows.length) % flatRows.length);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const row = flatRows[selectedIdx];
      if (row !== undefined) activate(row);
      return;
    }
  }

  function onAgentChange(e: React.ChangeEvent<HTMLSelectElement>): void {
    const next = e.target.value as AgentKey | "";
    const key: AgentKey = next === "" ? null : (next as NonNullable<AgentKey>);
    setActiveAgent(key);
    writeStoredActiveAgent(key);
  }

  /* Render counter — same pattern as cmdk so each visible row knows its
     position in the flattened ordering used by selectedIdx. */
  let rowIdx = -1;

  return (
    <div
      className="modal cmdk-modal"
      onClick={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      aria-label="Skills palette"
    >
      <div className="cmdk skills-pal">
        <div className="cmdk-input-row">
          <Sparkles
            size={16}
            style={{ color: "var(--agent, var(--ink-3))" }}
            aria-hidden
          />
          <input
            ref={inputRef}
            type="text"
            className="cmdk-input"
            placeholder="Search skills…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKeyDown}
            aria-label="Search skills"
            autoComplete="off"
            spellCheck={false}
          />
          <label
            className="skills-agent-select"
            title="Filter skills by agent"
          >
            <span className="skills-agent-label">Agent</span>
            <select
              value={activeAgent ?? ""}
              onChange={onAgentChange}
              aria-label="Active agent"
            >
              {KNOWN_AGENT_KEYS.map((k) => (
                <option key={k} value={k}>
                  {AGENT_LABELS[k]}
                </option>
              ))}
            </select>
          </label>
          <kbd>esc</kbd>
        </div>

        <div className="cmdk-results" ref={resultsRef} role="listbox">
          {loading ? (
            <div className="cmdk-empty">Loading skills…</div>
          ) : error !== null ? (
            <div className="cmdk-empty" role="alert">
              Couldn’t load skills: {error}
            </div>
          ) : flatRows.length === 0 ? (
            <div className="cmdk-empty">
              {query.trim().length > 0
                ? `No skills match “${query.trim()}”.`
                : "No skills found. Install agent-specific skills under .claude/skills/, .codex/skills/, .gemini/skills/, or .skills/."}
            </div>
          ) : (
            groups.map((g) => (
              <div key={g.agent} data-testid={`skills-group-${g.agent}`}>
                <div className="cmdk-group">{g.label}</div>
                {g.skills.map((s) => {
                  rowIdx += 1;
                  const idx = rowIdx;
                  const sel = idx === selectedIdx;
                  const badge =
                    s.agent in AGENT_BADGE
                      ? AGENT_BADGE[s.agent as NonNullable<AgentKey>]
                      : s.agent.slice(0, 3);
                  return (
                    <button
                      type="button"
                      key={s.path}
                      className={`cmdk-row skill-row${sel ? " sel" : ""}`}
                      data-skill-idx={idx}
                      data-skill-name={s.name}
                      data-skill-agent={s.agent}
                      role="option"
                      aria-selected={sel}
                      onMouseEnter={() => setSelectedIdx(idx)}
                      onClick={() => activate(s)}
                    >
                      <span className="cmdk-icon">{iconFor(s)}</span>
                      <div className="skill-text">
                        <div className="skill-name">
                          /{s.name}
                          {typeof s.args === "string" && s.args.length > 0 ? (
                            <span className="skill-args"> {s.args}</span>
                          ) : null}
                        </div>
                        {s.description.length > 0 ? (
                          <div className="skill-desc">{s.description}</div>
                        ) : null}
                      </div>
                      <span className="skill-badge">{badge}</span>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className="cmdk-foot">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd>
            navigate
          </span>
          <span>
            <kbd>↵</kbd>
            run
          </span>
          <span>
            <kbd>esc</kbd>
            close
          </span>
          <span style={{ marginLeft: "auto" }}>
            Skills are user-defined prompts that run on the agent’s next turn
          </span>
        </div>
      </div>
    </div>
  );
}
