import { EnvProbeBanner } from "../../components/EnvProbeBanner.js";
import { copyToClipboard } from "../../render/copy.js";
import { useStore } from "../../state/store.js";
import { useRegisteredRuntimes } from "./useRegisteredRuntimes.js";

export function RuntimeProbeBanner(): JSX.Element | null {
  const envProbe = useStore((s) => s.envProbe);
  const registeredRuntimes = useRegisteredRuntimes(envProbe);

  return (
    <EnvProbeBanner
      envProbe={envProbe}
      registeredRuntimes={registeredRuntimes}
      onCopyInstall={(cmd) => {
        void copyToClipboard(cmd);
      }}
    />
  );
}
