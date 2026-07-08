import type { NormalizedCodexDetectInput } from "./detectInput.js";
import {
  codexHookTrustStateFromToml,
  fmarkHookTrustEntriesFromJson,
} from "./trust.js";

export function codexHooksTrusted(source: NormalizedCodexDetectInput): boolean {
  const trustEntries =
    source.hooksJson.trim().length > 0
      ? fmarkHookTrustEntriesFromJson(source.hooksJson, source.configPath)
      : [];
  const trustState = codexHookTrustStateFromToml(source.toml);
  return (
    trustEntries.length === 0 ||
    trustEntries.every((entry) => {
      const state = trustState.get(entry.key);
      return state?.enabled !== false && state?.trustedHash === entry.hash;
    })
  );
}
