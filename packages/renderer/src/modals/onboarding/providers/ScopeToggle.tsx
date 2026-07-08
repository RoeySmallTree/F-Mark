import type { JSX } from "react";
import type { Scope } from "./types.js";

const NO_LOOSE_STRING_VALUES = {
  codex: "codex",
  user: "user",
  project: "project",
} as const;

export function ScopeToggle({
  runtimeId,
  scope,
  onScopeChange,
}: {
  runtimeId: string | null;
  scope: Scope;
  onScopeChange(scope: Scope): void;
}): JSX.Element {
  const localDisabled = runtimeId === NO_LOOSE_STRING_VALUES.codex;
  return (
    <div className="seg-control" role="radiogroup" aria-label="Setup scope">
      <button
        type="button"
        role="radio"
        aria-checked={scope === "user"}
        className={scope === "user" ? "on" : ""}
        onClick={() => onScopeChange(NO_LOOSE_STRING_VALUES.user)}
      >
        Global
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={scope === "project"}
        className={scope === "project" ? "on" : ""}
        disabled={localDisabled}
        title={localDisabled ? "Codex is global-only (CODEX_HOME)" : undefined}
        onClick={() => onScopeChange(NO_LOOSE_STRING_VALUES.project)}
      >
        Local
      </button>
    </div>
  );
}
