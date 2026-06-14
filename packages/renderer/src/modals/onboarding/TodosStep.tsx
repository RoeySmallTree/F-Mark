/* TodosStep — seed the first session with todos and an opening prompt. On
   finish these are posted to the session (todos assigned to the spawned agent)
   and the agent is woken so it starts with the work in hand. */

import { useRef, type JSX } from "react";
import { Plus, X } from "lucide-react";

export interface TodosStepProps {
  todos: string[];
  prompt: string;
  agentName: string | null;
  onTodosChange(todos: string[]): void;
  onPromptChange(prompt: string): void;
}

export function TodosStep({
  todos,
  prompt,
  agentName,
  onTodosChange,
  onPromptChange,
}: TodosStepProps): JSX.Element {
  const rowsRef = useRef<HTMLDivElement | null>(null);

  function setAt(i: number, value: string): void {
    const next = todos.slice();
    next[i] = value;
    onTodosChange(next);
  }
  function removeAt(i: number): void {
    onTodosChange(todos.filter((_, idx) => idx !== i));
  }
  function add(): void {
    onTodosChange([...todos, ""]);
    // Focus the new row after it renders.
    requestAnimationFrame(() => {
      const inputs = rowsRef.current?.querySelectorAll("input");
      inputs?.[inputs.length - 1]?.focus();
    });
  }

  return (
    <div className="ob-todos">
      <div className="ob-todos-block">
        <label className="form-label">TODOS</label>
        <div className="form-hint">
          {agentName !== null
            ? `Assigned to ${agentName} and delivered the moment the session opens.`
            : "Delivered to the session when it opens."}
        </div>
        <div className="ob-todo-rows" ref={rowsRef}>
          {todos.map((t, i) => (
            <div className="ob-todo-row" key={i}>
              <span className="ob-todo-bullet" />
              <input
                className="form-input"
                placeholder="e.g. Set up the test harness"
                value={t}
                aria-label={`Todo ${i + 1}`}
                onChange={(e) => setAt(i, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (i === todos.length - 1 && t.trim().length > 0) add();
                  }
                }}
              />
              <button
                type="button"
                className="icon-btn ob-todo-remove"
                aria-label={`Remove todo ${i + 1}`}
                onClick={() => removeAt(i)}
              >
                <X size={13} aria-hidden />
              </button>
            </div>
          ))}
        </div>
        <button type="button" className="btn-ghost ob-todo-add" onClick={add}>
          <Plus size={13} aria-hidden /> Add todo
        </button>
      </div>

      <div className="ob-todos-block">
        <label className="form-label" htmlFor="ob-prompt">
          FIRST PROMPT
        </label>
        <div className="form-hint">
          The opening message {agentName !== null ? agentName : "your agent"}{" "}
          receives. Leave blank to start quiet.
        </div>
        <textarea
          id="ob-prompt"
          className="form-input ob-prompt"
          rows={5}
          placeholder="Read the todos above, then start with the first one. Ask me before any destructive change."
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
        />
      </div>
    </div>
  );
}
