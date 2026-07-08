const NO_LOOSE_STRING_VALUES = {
  once: "once",
  session: "session",
  always: "always",
  approve: "approve",
  deny: "deny",
} as const;

/* Approval scope classification.

   A provider's permission request comes with `suggestions` — usually several
   "approve" variants (allow once / for this session / always) plus a "deny".
   The labels are verbose and provider-specific ("Run the tool and remember this
   choice for this session…"), so instead of rendering one button per suggestion
   we collapse the approve variants into a single Allow button + a once/session/
   always scope selector, and the deny into a single Cancel.

   Scope is read from `suggestion.scope` when the provider sets it, and otherwise
   inferred from the id/label text. */

import type { AccessRequestSuggestion } from "@f-mark/shared";

export type ApprovalScope = "once" | "session" | "always";

const SCOPE_ORDER: ApprovalScope[] = ["once", "session", "always"];

export const SCOPE_META: Record<ApprovalScope, { label: string; hint: string }> = {
  once: { label: "Once", hint: "Allow just this one call" },
  session: { label: "This session", hint: "Allow and remember for this session" },
  always: { label: "Always", hint: "Always allow this without asking" },
};

/** Resolve a suggestion to a scope, preferring the explicit field. */
export function scopeOfSuggestion(s: AccessRequestSuggestion): ApprovalScope {
  if (s.scope === NO_LOOSE_STRING_VALUES.once || s.scope === NO_LOOSE_STRING_VALUES.session || s.scope === NO_LOOSE_STRING_VALUES.always) {
    return s.scope;
  }
  const text = `${s.id} ${s.label}`.toLowerCase();
  // Session is checked before "always" so "remember for this session" lands
  // on session. Note "allow" is deliberately NOT an "always" signal — nearly
  // every approve label contains it ("Allow", "Allow once"), so matching it
  // would mis-bucket the basic one-time approve as a permanent grant.
  if (/\bsession\b|this session|for this session/.test(text)) return NO_LOOSE_STRING_VALUES.session;
  // "always" signals are the persistent/expanded grants: an explicit "always",
  // an allowlist, "remember", or the compound "allow access to …" / "and allow"
  // (which expand the grant) — but NOT a bare "Allow", which is just once.
  if (
    /\balways\b|allow access|and allow|allowlist|whitelist|permanent|forever|every time|don'?t ask again|\bremember\b/.test(
      text,
    )
  ) {
    return NO_LOOSE_STRING_VALUES.always;
  }
  return NO_LOOSE_STRING_VALUES.once;
}

export interface ApprovalChoices {
  /** One approve suggestion per available scope, in once→session→always order. */
  scopes: Array<{ scope: ApprovalScope; suggestion: AccessRequestSuggestion }>;
  /** The deny / cancel suggestion, if the provider offered a specific one. */
  cancel: AccessRequestSuggestion | undefined;
}

/** Group approve suggestions by scope (first wins per scope) + pick the deny. */
export function classifyApprovalSuggestions(
  suggestions: AccessRequestSuggestion[],
): ApprovalChoices {
  const byScope = new Map<ApprovalScope, AccessRequestSuggestion>();
  for (const s of suggestions) {
    if (s.decision !== NO_LOOSE_STRING_VALUES.approve) continue;
    const scope = scopeOfSuggestion(s);
    if (!byScope.has(scope)) byScope.set(scope, s);
  }
  // "Allow once" is the safe minimal approve and is always offered. When the
  // provider didn't supply a distinct once variant, fall back to the first
  // approve suggestion so picking Once still maps to a real response.
  if (!byScope.has("once")) {
    const baseApprove = suggestions.find((s) => s.decision === NO_LOOSE_STRING_VALUES.approve);
    if (baseApprove !== undefined) byScope.set("once", baseApprove);
  }
  const scopes = SCOPE_ORDER.filter((sc) => byScope.has(sc)).map((sc) => ({
    scope: sc,
    suggestion: byScope.get(sc)!,
  }));
  const cancel = suggestions.find((s) => s.decision === NO_LOOSE_STRING_VALUES.deny);
  return { scopes, cancel };
}
