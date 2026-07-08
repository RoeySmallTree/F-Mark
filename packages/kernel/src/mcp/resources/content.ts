function textContent(uri: string, text: string, mimeType: string) {
  return {
    contents: [{ uri, text, mimeType }],
  };
}

export function jsonContent(uri: string, value: unknown) {
  return textContent(uri, JSON.stringify(value, null, 2), "application/json");
}

export function markdownContent(uri: string, value: unknown) {
  return textContent(
    uri,
    typeof value === "string" ? value : JSON.stringify(value, null, 2),
    "text/markdown",
  );
}
