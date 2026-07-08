import { useCallback, useEffect, useState } from "react";
import { readOnboarded } from "../state/settings.js";

export function useOnboardingGate(): {
  onboardingOpen: boolean;
  closeOnboarding(): void;
} {
  /* First-launch onboarding gate. Opens once on a browser that has never
     completed or skipped the wizard (tracked via the `onboarded` setting).
     Owned as local app state so the wizard can render inside
     <AgentSpawnProvider> and reach the spawn context for provider setup +
     the first launch. */
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const closeOnboarding = useCallback(() => setOnboardingOpen(false), []);

  useEffect(() => {
    if (!readOnboarded()) setOnboardingOpen(true);
  }, []);

  return { onboardingOpen, closeOnboarding };
}
