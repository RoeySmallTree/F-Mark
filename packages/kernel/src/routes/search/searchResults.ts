import type { SearchHit } from "@f-mark/shared";
import { readVisibleEvents } from "../../events/visible.js";
import { SearchEventMatcher } from "./eventMatcher.js";
import type { SearchTarget } from "./searchTargets.js";

export class SearchHitCollector {
  private readonly matcher: SearchEventMatcher;

  constructor(queryLower: string) {
    this.matcher = new SearchEventMatcher(queryLower);
  }

  async collect(targets: SearchTarget[], limit: number): Promise<SearchHit[]> {
    const hits: SearchHit[] = [];
    for (const target of targets) {
      await this.collectTarget(target, hits);
    }
    hits.sort((a, b) => b.event.timestamp.localeCompare(a.event.timestamp));
    return hits.slice(0, limit);
  }

  private async collectTarget(
    target: SearchTarget,
    hits: SearchHit[],
  ): Promise<void> {
    const events = await readVisibleEvents(target.p, target.sessionId, {});
    for (const event of events) {
      const snippet = this.matcher.match(event);
      if (snippet === null) continue;
      hits.push({
        session_id: target.sessionId,
        session_slug: target.sessionSlug,
        path: target.path,
        path_id: target.pathId,
        event,
        snippet,
      });
    }
  }
}
