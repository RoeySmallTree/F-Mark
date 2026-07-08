import type { AnyEventRecord } from "@f-mark/shared";
import { isNamedAnchor } from "@f-mark/shared";
import { rangeBounds, type RangeBounds } from "./range.js";
import { parseEventTimestamp } from "./timestamp.js";
import type { LogFilter } from "./types.js";

export class LogFilterEvaluator {
  private readonly bounds: RangeBounds;
  private readonly kindSet: Set<string>;
  private readonly participantSet: Set<string>;

  constructor(
    private readonly filter: LogFilter,
    now: Date,
  ) {
    this.bounds = rangeBounds(filter, now);
    this.kindSet = new Set(filter.kinds);
    this.participantSet = new Set(filter.participants);
  }

  matches(event: AnyEventRecord): boolean {
    return (
      this.matchesKind(event) &&
      this.matchesParticipant(event) &&
      this.matchesRange(event) &&
      this.matchesNamed(event)
    );
  }

  private matchesKind(event: AnyEventRecord): boolean {
    return this.kindSet.size === 0 || this.kindSet.has(event.kind);
  }

  private matchesParticipant(event: AnyEventRecord): boolean {
    return (
      this.participantSet.size === 0 ||
      this.participantSet.has(event.participant_id)
    );
  }

  private matchesRange(event: AnyEventRecord): boolean {
    if (this.bounds.start === null && this.bounds.end === null) return true;
    const date = parseEventTimestamp(event.timestamp);
    return (
      date !== null &&
      this.matchesRangeStart(date) &&
      this.matchesRangeEnd(date)
    );
  }

  private matchesRangeStart(date: Date): boolean {
    return this.bounds.start === null || date >= this.bounds.start;
  }

  private matchesRangeEnd(date: Date): boolean {
    return this.bounds.end === null || date <= this.bounds.end;
  }

  private matchesNamed(event: AnyEventRecord): boolean {
    return !this.filter.namedOnly || isNamedAnchor(event);
  }
}
