const SEQ_URL = "http://localhost:5455";
const APP_NAME = "f-mark";

export enum LogLevel {
  Verbose = "Verbose",
  Debug = "Debug",
  Info = "Information",
  Warning = "Warning",
  Error = "Error",
  Fatal = "Fatal",
}

type LogProps = Record<string, unknown>;

export async function seqLog(
  message: string,
  propsOrLevel?: LogProps | LogLevel,
  maybeLevel?: LogLevel,
): Promise<void> {
  const rawProps = typeof propsOrLevel === "object" ? propsOrLevel : undefined;
  const level = typeof propsOrLevel === "string" ? propsOrLevel : (maybeLevel ?? LogLevel.Debug);
  const { $note, $hideWhen, ...props } = (rawProps ?? {}) as LogProps & { $note?: string; $hideWhen?: boolean };
  if ($hideWhen) return;
  try {
    await fetch(`${SEQ_URL}/api/events/raw`, {
      method: "POST",
      headers: { "Content-Type": "application/vnd.serilog.clef" },
      body: JSON.stringify({
        "@t": new Date().toISOString(),
        "@l": level,
        "@mt": message,
        app: APP_NAME,
        layer: "backend",
        ...($note !== undefined && { note: $note }),
        ...props,
      }),
    });
  } catch {
    // no-op
  }
}
