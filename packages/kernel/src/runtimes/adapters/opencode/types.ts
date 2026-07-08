export interface OpencodeCliResult {
  stdout: string;
  stderr: string;
  code: number;
}

export type OpencodeCliRunner = (args: string[]) => Promise<OpencodeCliResult>;

export interface VerboseEntry {
  id: string;
  json: {
    id?: string;
    providerID?: string;
    name?: string;
    description?: string;
    contextWindow?: unknown;
    context_window?: unknown;
    context?: unknown;
    limits?: unknown;
    limit?: unknown;
    variants?: Record<string, unknown>;
  };
}
