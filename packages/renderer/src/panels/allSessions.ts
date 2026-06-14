import { useEffect, useMemo, useState } from "react";
import type { AnyEventRecord, EventKind, Participant } from "@f-mark/shared";
import {
  createClient,
  type SessionEventGroup,
  type SessionMeta,
} from "../api/client.js";
import { connectWs } from "../api/ws.js";
import { useStore } from "../state/store.js";

export function basename(absPath: string | null | undefined): string {
  if (absPath === null || absPath === undefined || absPath.length === 0) {
    return "Current repo";
  }
  const trimmed = absPath.replace(/\/+$/, "");
  const slash = trimmed.lastIndexOf("/");
  if (slash < 0) return trimmed;
  return trimmed.slice(slash + 1) || trimmed;
}

export function sessionLabel(session: SessionMeta): string {
  return session.slug || session.id;
}

export function scopeLabel(path: string, session: SessionMeta): string {
  return `${basename(path)} / ${sessionLabel(session)}`;
}

export function shortPreview(text: string, max = 110): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}...`;
}

export interface AllSessionItem {
  path: string;
  pathId: string;
  session: SessionMeta;
  event: AnyEventRecord;
  participants: Record<string, Participant>;
}

export interface PathSessionGroup {
  path: string;
  pathId: string;
  sessions: Array<{
    session: SessionMeta;
    events: AnyEventRecord[];
    participants: Record<string, Participant>;
  }>;
}

function sortGroups(groups: SessionEventGroup[]): SessionEventGroup[] {
  return [...groups].sort((a, b) => {
    const latestA = a.events.at(-1)?.timestamp ?? a.session.created_at;
    const latestB = b.events.at(-1)?.timestamp ?? b.session.created_at;
    return latestB.localeCompare(latestA);
  });
}

export function groupByPath(
  groups: SessionEventGroup[],
  filter: (event: AnyEventRecord) => boolean,
): PathSessionGroup[] {
  const byPath = new Map<string, PathSessionGroup>();
  for (const group of groups) {
    const events = group.events.filter(filter);
    if (events.length === 0) continue;
    const existing = byPath.get(group.path);
    const session = {
      session: group.session,
      events,
      participants: group.participants,
    };
    if (existing !== undefined) {
      existing.sessions.push(session);
    } else {
      byPath.set(group.path, {
        path: group.path,
        pathId: group.path_id,
        sessions: [session],
      });
    }
  }
  return [...byPath.values()];
}

export function flattenSessionItems(
  groups: SessionEventGroup[],
  filter: (event: AnyEventRecord) => boolean,
): AllSessionItem[] {
  const out: AllSessionItem[] = [];
  for (const group of groups) {
    for (const event of group.events) {
      if (!filter(event)) continue;
      out.push({
        path: group.path,
        pathId: group.path_id,
        session: group.session,
        event,
        participants: group.participants,
      });
    }
  }
  return out.sort((a, b) => b.event.timestamp.localeCompare(a.event.timestamp));
}

export function groupRecordsByPath<T extends { group: SessionEventGroup }>(
  records: T[],
): Array<{ path: string; pathId: string; records: T[] }> {
  const byPath = new Map<string, { path: string; pathId: string; records: T[] }>();
  for (const record of records) {
    const existing = byPath.get(record.group.path);
    if (existing !== undefined) {
      existing.records.push(record);
    } else {
      byPath.set(record.group.path, {
        path: record.group.path,
        pathId: record.group.path_id,
        records: [record],
      });
    }
  }
  return [...byPath.values()];
}

export function useAllSessionEvents(kinds?: EventKind[]): {
  groups: SessionEventGroup[];
  loading: boolean;
  error: string | null;
  refresh(): void;
} {
  const token = useStore((s) => s.token);
  const [groups, setGroups] = useState<SessionEventGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const kindsKey = useMemo(() => kinds?.join(",") ?? "", [kinds]);

  useEffect(() => {
    const client = createClient({ baseUrl: "", token });
    let cancelled = false;

    const refresh = (): void => {
      setLoading(true);
      void client
        .listAllSessionEvents(kinds)
        .then((next) => {
          if (cancelled) return;
          setGroups(sortGroups(next));
          setError(null);
        })
        .catch((err) => {
          if (cancelled) return;
          setError(err instanceof Error ? err.message : String(err));
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    };

    refresh();
    const ws = connectWs({ baseUrl: "", token }, (msg) => {
      if (
        msg.type === "event_added" ||
        msg.type === "path-switched" ||
        msg.type === "session.forked"
      ) {
        refresh();
      }
    });

    return () => {
      cancelled = true;
      ws.close();
    };
  }, [token, kindsKey]);

  return {
    groups,
    loading,
    error,
    refresh: () => {
      const client = createClient({ baseUrl: "", token });
      void client.listAllSessionEvents(kinds).then((next) => {
        setGroups(sortGroups(next));
        setError(null);
      });
    },
  };
}
