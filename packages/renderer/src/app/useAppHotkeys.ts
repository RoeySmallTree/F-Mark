import { useMemo } from "react";
import { useHotkeys } from "../hooks/useHotkeys.js";
import { useStore } from "../state/store.js";

const NO_LOOSE_STRING_VALUES = {
  cmdk: "cmdk",
} as const;

export function useAppHotkeys({
  devKernelRestartEnabled,
  restartKernel,
}: {
  devKernelRestartEnabled: boolean;
  restartKernel(): void;
}): void {
  const openModal = useStore((s) => s.openModal);

  const hotkeys = useMemo(
    () => ({
      "$mod+k": (): void => {
        openModal(NO_LOOSE_STRING_VALUES.cmdk);
      },
      "meta+alt+ctrl+r": (): void | false => {
        if (!devKernelRestartEnabled) return false;
        restartKernel();
      },
    }),
    [devKernelRestartEnabled, openModal, restartKernel],
  );

  useHotkeys(hotkeys);
}
