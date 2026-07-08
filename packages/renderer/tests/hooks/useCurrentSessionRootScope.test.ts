import { describe, expect, it } from "vitest";
import { rootScopeKey } from "../../src/api/rootScope.js";

describe("rootScopeKey", () => {
  it("serializes pathId and root scopes for stable effect deps", () => {
    expect(rootScopeKey({ pathId: "abc123" })).toBe("path_id:abc123");
    expect(rootScopeKey({ root: "/workspace/project" })).toBe(
      "root:/workspace/project",
    );
    expect(rootScopeKey(null)).toBe("");
  });
});
