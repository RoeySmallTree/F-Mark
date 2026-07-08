/* PixelBlast - animated pixelated noise/ripple field rendered with three.js.
   Source: https://reactbits.dev (PixelBlast). Ported to TypeScript with
   strict + noUncheckedIndexedAccess compliance. */

import type { JSX } from "react";
import { usePixelBlastRuntime } from "./pixelBlast/usePixelBlastRuntime.js";
import type { PixelBlastProps } from "./pixelBlast/types.js";
import "./PixelBlast.css";

export type { PixelBlastProps } from "./pixelBlast/types.js";

export function PixelBlast(props: PixelBlastProps): JSX.Element {
  const containerRef = usePixelBlastRuntime(props);
  const { className, style } = props;

  return (
    <div
      ref={containerRef}
      className={`pixel-blast-container ${className ?? ""}`}
      style={style}
      aria-label="PixelBlast interactive background"
    />
  );
}

export default PixelBlast;
