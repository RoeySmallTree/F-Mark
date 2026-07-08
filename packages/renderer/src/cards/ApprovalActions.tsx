const NO_LOOSE_STRING_VALUES = {
  card: "card",
  once: "once",
  allow: "Allow",
  deny: "deny",
  approve: "approve",
} as const;

/* ApprovalActions — the shared decision UI for a pending permission request.

   Renders a once/session/always scope selector (only the scopes the provider
   actually offered) + a single primary Allow button + a single Cancel button.
   Used both in the feed's approval card (`variant="card"`) and the composer's
   pending-approval strip (`variant="strip"`). The parent owns the network call
   via `onRespond`. */

import { useEffect, useMemo, useState, type JSX } from "react";
import { Check, X } from "lucide-react";
import type { AccessRequestSuggestion } from "@f-mark/shared";
import {
  classifyApprovalSuggestions,
  SCOPE_META,
  type ApprovalScope,
} from "./approvalScope.js";

interface Props {
  suggestions: AccessRequestSuggestion[];
  disabled?: boolean;
  busy?: "approve" | "deny" | null;
  variant?: "card" | "strip";
  onRespond(decision: "approve" | "deny", option?: AccessRequestSuggestion): void;
}

export function ApprovalActions({
  suggestions,
  disabled = false,
  busy = null,
  variant = NO_LOOSE_STRING_VALUES.card,
  onRespond,
}: Props): JSX.Element {
  const { scopes, cancel } = classifyApprovalSuggestions(suggestions);
  const suggestionKey = useMemo(
    () =>
      suggestions
        .map((s) => `${s.id}:${s.decision}:${s.scope ?? ""}:${s.label}`)
        .join("|"),
    [suggestions],
  );
  const firstScope = scopes[0]?.scope ?? NO_LOOSE_STRING_VALUES.once;
  const [scope, setScope] = useState<ApprovalScope>(firstScope);

  useEffect(() => {
    setScope(firstScope);
  }, [firstScope, suggestionKey]);

  const active = scopes.find((s) => s.scope === scope) ?? scopes[0];
  const blocked = disabled || busy !== null;
  const allowLabel =
    active === undefined
      ? NO_LOOSE_STRING_VALUES.allow
      : `Allow ${SCOPE_META[active.scope].label.toLowerCase()}`;

  return (
    <div className={`approval-actions approval-actions--${variant}`}>
      {scopes.length > 1 ? (
        <div className="approval-scope" role="radiogroup" aria-label="Approval scope">
          {scopes.map((s) => (
            <button
              type="button"
              key={s.scope}
              role="radio"
              aria-checked={s.scope === scope}
              className={`approval-scope-opt${s.scope === scope ? " on" : ""}`}
              title={s.suggestion.description ?? SCOPE_META[s.scope].hint}
              disabled={disabled}
              onClick={() => setScope(s.scope)}
            >
              {SCOPE_META[s.scope].label}
            </button>
          ))}
        </div>
      ) : null}
      <div className="approval-actions-buttons">
        <button
          type="button"
          className="btn-deny"
          data-decision="deny"
          aria-label="Cancel this tool call"
          disabled={blocked}
          onClick={() => onRespond(NO_LOOSE_STRING_VALUES.deny, cancel)}
        >
          <X size={14} aria-hidden />
          Cancel
        </button>
        <button
          type="button"
          className="btn-approve"
          data-decision="approve"
          aria-label={allowLabel}
          disabled={blocked}
          onClick={() => onRespond(NO_LOOSE_STRING_VALUES.approve, active?.suggestion)}
        >
          <Check size={14} aria-hidden />
          {allowLabel}
        </button>
      </div>
    </div>
  );
}
