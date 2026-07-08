import type { JSX, ReactNode } from "react";

export function RuntimeFormFrame({
  children,
}: {
  children: ReactNode;
}): JSX.Element {
  return (
    <div
      style={{
        marginTop: 14,
        padding: 12,
        border: "1px solid var(--line)",
        borderRadius: 8,
        background: "var(--bg)",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
      data-testid="runtime-form"
    >
      {children}
    </div>
  );
}
