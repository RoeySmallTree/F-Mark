import type { JSX } from "react";

export function RuntimeFormError({
  error,
}: {
  error: string | null;
}): JSX.Element | null {
  if (error === null) return null;
  return (
    <div role="alert" className="form-error">
      {error}
    </div>
  );
}
