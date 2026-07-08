import { describe, it, expect } from "vitest";
import type { AccessRequestSuggestion } from "@f-mark/shared";
import {
  scopeOfSuggestion,
  classifyApprovalSuggestions,
} from "./approvalScope.js";

const sug = (
  id: string,
  label: string,
  decision: "approve" | "deny",
  scope?: "once" | "session" | "always",
): AccessRequestSuggestion =>
  ({ id, label, decision, ...(scope ? { scope } : {}) }) as AccessRequestSuggestion;

describe("scopeOfSuggestion", () => {
  it("treats a bare Allow / Yes as once, not always", () => {
    expect(scopeOfSuggestion(sug("a", "Allow", "approve"))).toBe("once");
    expect(scopeOfSuggestion(sug("y", "Yes", "approve"))).toBe("once");
  });

  it("treats a compound allow-access / and-allow grant as always", () => {
    expect(
      scopeOfSuggestion(
        sug("e", "Yes, and allow access to .bin/ and timeout 10 commands", "approve"),
      ),
    ).toBe("always");
    expect(scopeOfSuggestion(sug("w", "Allow always", "approve"))).toBe("always");
    expect(
      scopeOfSuggestion(sug("r", "Allow and remember this", "approve")),
    ).toBe("always");
  });

  it("detects session before always", () => {
    expect(
      scopeOfSuggestion(sug("s", "Allow access for this session", "approve")),
    ).toBe("session");
  });

  it("prefers the explicit scope field over label inference", () => {
    expect(scopeOfSuggestion(sug("x", "Allow always", "approve", "once"))).toBe(
      "once",
    );
  });
});

describe("classifyApprovalSuggestions", () => {
  it("always offers Once, even when the provider only sent session + always", () => {
    const { scopes } = classifyApprovalSuggestions([
      sug("s", "Yes, allow for this session", "approve"),
      sug("w", "Yes, always allow", "approve"),
      sug("n", "No", "deny"),
    ]);
    expect(scopes.map((s) => s.scope)).toEqual(["once", "session", "always"]);
  });

  it("surfaces all three scopes for a base Allow + session + always", () => {
    const { scopes, cancel } = classifyApprovalSuggestions([
      sug("a", "Allow", "approve"),
      sug("s", "Allow access for this session", "approve"),
      sug("w", "Allow always, don't ask again", "approve"),
      sug("d", "Deny", "deny"),
    ]);
    expect(scopes.map((s) => s.scope)).toEqual(["once", "session", "always"]);
    expect(scopes.find((s) => s.scope === "once")?.suggestion.id).toBe("a");
    expect(cancel?.id).toBe("d");
  });

  it("offers only Once when there is a single approve", () => {
    const { scopes } = classifyApprovalSuggestions([
      sug("y", "Yes", "approve"),
      sug("n", "No", "deny"),
    ]);
    expect(scopes.map((s) => s.scope)).toEqual(["once"]);
  });
});
