export function parseCliPortValue(value: string): number {
  const port = Number.parseInt(value, 10);
  if (
    !Number.isInteger(port) ||
    String(port) !== value ||
    port < 1 ||
    port > 65535
  ) {
    throw new Error(`--port: invalid port number "${value}"`);
  }
  return port;
}
