import { useEffect, useRef, useState } from "react";
import { pickKind } from "./art.js";

const NO_LOOSE_STRING_VALUES = {
  matrix: "matrix",
} as const;

const CHAR_PX = 6.9;

export function useArtKind(): string {
  const kindRef = useRef<string | null>(null);
  if (kindRef.current === null) kindRef.current = pickKind();
  return kindRef.current;
}

export function useArtColumns(): {
  artRef: React.RefObject<HTMLSpanElement | null>;
  cols: number;
} {
  const artRef = useRef<HTMLSpanElement | null>(null);
  const [cols, setCols] = useState(72);

  useEffect(() => {
    const el = artRef.current;
    if (el === null || typeof ResizeObserver === "undefined") return;
    const measure = (): void => {
      const w = el.clientWidth;
      if (w > 0) setCols(Math.max(16, Math.ceil(w / CHAR_PX) + 2));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return { artRef, cols };
}

export function useArtFrame(options: {
  blocked: boolean;
  kind: string;
  reduceMotion: boolean;
}): number {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (options.blocked || options.reduceMotion) return;
    const speed = options.kind === NO_LOOSE_STRING_VALUES.matrix ? 110 : 100;
    const id = window.setInterval(() => setFrame((v) => v + 1), speed);
    return () => window.clearInterval(id);
  }, [options.blocked, options.reduceMotion, options.kind]);

  return frame;
}

export function useNowMs(approvalPauseStartMs: number | null): number {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (approvalPauseStartMs !== null) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [approvalPauseStartMs]);

  return approvalPauseStartMs ?? nowMs;
}

