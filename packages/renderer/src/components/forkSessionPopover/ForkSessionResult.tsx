import type { JSX } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { ForkSessionResponse } from "../../api/client.js";

interface ForkSessionResultProps {
  result: ForkSessionResponse | null;
  warnings: string[];
}

export function ForkSessionResult({
  result,
  warnings,
}: ForkSessionResultProps): JSX.Element | null {
  if (result === null) return null;

  return (
    <div className="fork-session-result" role="status">
      <div className="fork-session-result-head">
        <CheckCircle2 size={14} aria-hidden />
        <span>{result.session.slug}</span>
      </div>
      <ForkWarnings warnings={warnings} />
    </div>
  );
}

function ForkWarnings({
  warnings,
}: {
  warnings: string[];
}): JSX.Element | null {
  if (warnings.length === 0) return null;

  return (
    <div className="fork-session-warnings">
      <AlertTriangle size={14} aria-hidden />
      <div>
        {warnings.map((warning) => (
          <div key={warning}>{warning}</div>
        ))}
      </div>
    </div>
  );
}
