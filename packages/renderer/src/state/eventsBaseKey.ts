import type { RootScope } from "../api/rootScope.js";

export function eventsBaseKeyFor(scope: RootScope, sessionId: string): string {
  const scopeKey = "pathId" in scope ? scope.pathId : scope.root;
  return `${scopeKey}/${sessionId}`;
}
