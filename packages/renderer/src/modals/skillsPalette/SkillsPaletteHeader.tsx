import {
  type ChangeEvent,
  type JSX,
  type KeyboardEvent,
  type RefObject,
} from "react";
import { Sparkles } from "lucide-react";
import {
  AGENT_LABELS,
  KNOWN_AGENT_KEYS,
  type AgentKey,
} from "../skills/active-agent.js";

const NO_LOOSE_STRING_VALUES = {
  off: "off",
} as const;

interface SkillsPaletteHeaderProps {
  activeAgent: AgentKey;
  inputRef: RefObject<HTMLInputElement>;
  onAgentChange: (agent: AgentKey) => void;
  onInputKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onQueryChange: (query: string) => void;
  query: string;
}

export function SkillsPaletteHeader({
  activeAgent,
  inputRef,
  onAgentChange,
  onInputKeyDown,
  onQueryChange,
  query,
}: SkillsPaletteHeaderProps): JSX.Element {
  return (
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
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={onInputKeyDown}
        aria-label="Search skills"
        autoComplete={NO_LOOSE_STRING_VALUES.off}
        spellCheck={false}
      />
      <AgentSelect activeAgent={activeAgent} onAgentChange={onAgentChange} />
      <kbd>esc</kbd>
    </div>
  );
}

interface AgentSelectProps {
  activeAgent: AgentKey;
  onAgentChange: (agent: AgentKey) => void;
}

function AgentSelect({
  activeAgent,
  onAgentChange,
}: AgentSelectProps): JSX.Element {
  function changeAgent(event: ChangeEvent<HTMLSelectElement>): void {
    const next = event.target.value as AgentKey | "";
    onAgentChange(next === "" ? null : (next as NonNullable<AgentKey>));
  }

  return (
    <label className="skills-agent-select" title="Filter skills by agent">
      <span className="skills-agent-label">Agent</span>
      <select
        value={activeAgent ?? ""}
        onChange={changeAgent}
        aria-label="Active agent"
      >
        {KNOWN_AGENT_KEYS.map((key) => (
          <option key={key} value={key}>
            {AGENT_LABELS[key]}
          </option>
        ))}
      </select>
    </label>
  );
}
