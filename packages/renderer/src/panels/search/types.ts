import type { SearchHit } from "@f-mark/shared";

export interface SearchSessionGroup {
  key: string;
  path?: string;
  session: string;
  hits: SearchHit[];
}

export interface SearchPathGroup {
  key: string;
  path?: string;
  sessions: SearchSessionGroup[];
}

export interface SearchController {
  query: string;
  setQuery(query: string): void;
  busy: boolean;
  error: string | null;
  hitCount: number;
  pathHitGroups: SearchPathGroup[];
}
