interface WaitForPortClearOptions {
  port: number;
  host: string;
  isPortListening: (port: number, host: string) => Promise<boolean>;
  sleep: (ms: number) => Promise<void>;
  pollIntervalMs: number;
  settleAttempts: number;
}

export async function waitForPortClear(
  options: WaitForPortClearOptions,
): Promise<boolean> {
  for (let attempt = 0; attempt < options.settleAttempts; attempt++) {
    if (!(await options.isPortListening(options.port, options.host))) return true;
    await options.sleep(options.pollIntervalMs);
  }
  return !(await options.isPortListening(options.port, options.host));
}
