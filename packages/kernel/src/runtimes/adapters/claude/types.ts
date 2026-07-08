export interface ClaudeCliResult {
  stdout: string;
  stderr: string;
  code: number;
}

export type ClaudeCliRunner = (args: string[]) => Promise<ClaudeCliResult>;
