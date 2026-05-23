import { useMemo } from "react";

const SEQ_URL = "http://localhost:5455";
const APP_NAME = "f-mark";

export enum LogLevel {
  Verbose = "Verbose",
  Debug = "Debug",
  Info = "Information",
  Warning = "Warning",
  Error = "Error",
}

type LogProps = Record<string, unknown>;

function sendSeq(message: string, props: LogProps, level: LogLevel) {
  const { $note, $hideWhen, ...rest } = props as LogProps & { $note?: string; $hideWhen?: boolean };
  if ($hideWhen) return;
  fetch(`${SEQ_URL}/api/events/raw`, {
    method: "POST",
    headers: { "Content-Type": "application/vnd.serilog.clef" },
    body: JSON.stringify({
      "@t": new Date().toISOString(),
      "@l": level,
      "@mt": message,
      app: APP_NAME,
      layer: "frontend",
      ...($note !== undefined && { note: $note }),
      ...rest,
    }),
  }).catch(() => {});
}

export function useSeqLog(component: string, context?: LogProps) {
  return useMemo(
    () =>
      (msg: string, propsOrLevel?: LogProps | LogLevel, maybeLevel?: LogLevel) => {
        const props = typeof propsOrLevel === "object" ? propsOrLevel : undefined;
        const level = typeof propsOrLevel === "string" ? propsOrLevel : (maybeLevel ?? LogLevel.Debug);
        sendSeq(msg, { component, ...context, ...props }, level);
      },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [component, JSON.stringify(context)],
  );
}
