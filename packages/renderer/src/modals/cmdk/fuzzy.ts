/**
 * Tiny fuzzy matcher used by the Command Palette (⌘K).
 *
 * Algorithm:
 *   - Lowercase both strings.
 *   - Walk the query character by character, advancing through the target.
 *     Each consumed query char must appear in `target` in order.
 *   - Tally a streak counter while characters land contiguously; reset to 0
 *     when we skip ahead. The score is (sum of streaks) + small bonuses for:
 *       · a prefix match (target starts with the query token);
 *       · matching word-boundary positions (after space / hyphen / underscore).
 *   - Return 0 if any query char is unmatched.
 *
 * This is not a research-grade fuzzy ranker — it's just enough to feel right
 * for command-palette result ordering. It's stable, side-effect free, and
 * fast on the small input sizes we deal with.
 */

export function fuzzyScore(query: string, target: string): number {
  if (query.length === 0) return 1; // empty query always matches with neutral score
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (t.length === 0) return 0;

  let score = 0;
  let streak = 0;
  let ti = 0;
  let lastMatchPos = -2;

  // Prefix bonus.
  if (t.startsWith(q)) score += 20;

  for (let qi = 0; qi < q.length; qi++) {
    const ch = q[qi]!;
    let found = -1;
    for (let j = ti; j < t.length; j++) {
      if (t[j] === ch) {
        found = j;
        break;
      }
    }
    if (found === -1) return 0;

    if (found === lastMatchPos + 1) {
      streak += 1;
      score += 2 + streak; // reward contiguous runs progressively
    } else {
      streak = 0;
      score += 1;
    }

    // Word-boundary bonus: a match that lands right after a separator counts
    // a bit extra (e.g. "fp" matching "find people").
    if (found === 0) {
      score += 4;
    } else {
      const prev = t[found - 1]!;
      if (prev === " " || prev === "-" || prev === "_" || prev === "/") {
        score += 3;
      }
    }

    lastMatchPos = found;
    ti = found + 1;
  }

  // Slight penalty for very long targets so concise labels rank first.
  const lengthPenalty = Math.max(0, Math.floor((t.length - q.length) / 20));
  return Math.max(1, score - lengthPenalty);
}

/**
 * Filter and rank a list of items by fuzzy-matching a query against a string
 * extracted from each item. Items with score 0 are dropped; the remainder is
 * returned sorted by descending score, with ties broken by original index for
 * stability.
 */
export function fuzzyFilter<T>(
  items: T[],
  query: string,
  getter: (x: T) => string,
): T[] {
  if (query.length === 0) return items;
  const scored: { item: T; score: number; idx: number }[] = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i]!;
    const score = fuzzyScore(query, getter(it));
    if (score > 0) scored.push({ item: it, score, idx: i });
  }
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.idx - b.idx;
  });
  return scored.map((s) => s.item);
}
