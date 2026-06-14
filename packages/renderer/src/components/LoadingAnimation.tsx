/* LoadingAnimation — fills its parent with a pixelated ambient field tinted
   with the active theme's accent color (--agent). Reusable across the app
   wherever a non-empty placeholder is needed while content loads. */

import { useEffect, useState, type CSSProperties, type JSX } from "react";
import { PixelBlast, type PixelBlastProps } from "./PixelBlast.js";

const FALLBACK_ACCENT = "#b86a1f";

function readAccent(): string {
  if (typeof window === "undefined") return FALLBACK_ACCENT;
  const raw = getComputedStyle(document.body)
    .getPropertyValue("--agent")
    .trim();
  return raw.length > 0 ? raw : FALLBACK_ACCENT;
}

export interface LoadingAnimationProps {
  className?: string;
  style?: CSSProperties;
  /** Override accent. Defaults to the theme's --agent token. */
  color?: string;
  /** Forwarded to PixelBlast for per-call tuning. */
  pixelBlastProps?: Partial<PixelBlastProps>;
}

export function LoadingAnimation({
  className,
  style,
  color,
  pixelBlastProps,
}: LoadingAnimationProps): JSX.Element {
  const [accent, setAccent] = useState<string>(() => color ?? readAccent());

  useEffect(() => {
    if (color) {
      setAccent(color);
      return;
    }
    setAccent(readAccent());
    const obs = new MutationObserver(() => setAccent(readAccent()));
    obs.observe(document.body, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => obs.disconnect();
  }, [color]);

  return (
    <div
      className={`loading-animation ${className ?? ""}`}
      style={style}
      aria-label="Loading"
      role="status"
    >
      <PixelBlast
        variant="circle"
        color={accent}
        pixelSize={4}
        patternScale={2.2}
        patternDensity={1.1}
        pixelSizeJitter={0.4}
        enableRipples={false}
        edgeFade={0.35}
        speed={0.35}
        transparent
        antialias
        {...pixelBlastProps}
      />
    </div>
  );
}

export default LoadingAnimation;
