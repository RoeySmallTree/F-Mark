import { useEffect, useRef } from "react";
import {
  cleanupPixelBlastRuntime,
  syncPixelBlastRuntime,
  type PixelBlastReinitConfig,
  type PixelBlastRuntimeHandle,
} from "./runtime.js";
import {
  resolvePixelBlastProps,
  toRuntimeConfig,
  type PixelBlastProps,
} from "./types.js";

export function usePixelBlastRuntime(props: PixelBlastProps) {
  const resolved = resolvePixelBlastProps(props);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const visibilityRef = useRef({ visible: true });
  const speedRef = useRef(resolved.speed);
  const runtimeRef = useRef<PixelBlastRuntimeHandle | null>(null);
  const prevConfigRef = useRef<PixelBlastReinitConfig | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    speedRef.current = resolved.speed;
    const result = syncPixelBlastRuntime({
      config: toRuntimeConfig(resolved),
      container,
      prevConfig: prevConfigRef.current,
      runtime: runtimeRef.current,
      refs: { speedRef, visibilityRef },
    });
    runtimeRef.current = result.runtime;
    prevConfigRef.current = result.prevConfig;

    return () => {
      runtimeRef.current = cleanupPixelBlastRuntime({
        container,
        preserveRuntime: result.mustReinit,
        runtime: runtimeRef.current,
      });
    };
  }, [
    resolved.antialias,
    resolved.liquid,
    resolved.noiseAmount,
    resolved.pixelSize,
    resolved.patternScale,
    resolved.patternDensity,
    resolved.enableRipples,
    resolved.rippleIntensityScale,
    resolved.rippleThickness,
    resolved.rippleSpeed,
    resolved.pixelSizeJitter,
    resolved.edgeFade,
    resolved.transparent,
    resolved.liquidStrength,
    resolved.liquidRadius,
    resolved.liquidWobbleSpeed,
    resolved.autoPauseOffscreen,
    resolved.variant,
    resolved.color,
    resolved.speed,
  ]);

  return containerRef;
}
