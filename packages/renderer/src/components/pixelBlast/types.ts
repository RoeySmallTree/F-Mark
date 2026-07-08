import type { CSSProperties } from "react";
import type { ShapeVariant } from "./constants.js";
import type { PixelBlastRuntimeConfig } from "./runtime.js";

const NO_LOOSE_STRING_VALUES = {
  square: "square",
} as const;

export interface PixelBlastProps {
  variant?: ShapeVariant;
  pixelSize?: number;
  color?: string;
  className?: string;
  style?: CSSProperties;
  antialias?: boolean;
  patternScale?: number;
  patternDensity?: number;
  liquid?: boolean;
  liquidStrength?: number;
  liquidRadius?: number;
  pixelSizeJitter?: number;
  enableRipples?: boolean;
  rippleIntensityScale?: number;
  rippleThickness?: number;
  rippleSpeed?: number;
  liquidWobbleSpeed?: number;
  autoPauseOffscreen?: boolean;
  speed?: number;
  transparent?: boolean;
  edgeFade?: number;
  noiseAmount?: number;
}

export interface ResolvedPixelBlastProps extends PixelBlastRuntimeConfig {
  speed: number;
}

export function resolvePixelBlastProps({
  antialias = true,
  autoPauseOffscreen = true,
  color = "#B497CF",
  edgeFade = 0.5,
  enableRipples = true,
  liquid = false,
  liquidRadius = 1,
  liquidStrength = 0.1,
  liquidWobbleSpeed = 4.5,
  noiseAmount = 0,
  patternDensity = 1,
  patternScale = 2,
  pixelSize = 3,
  pixelSizeJitter = 0,
  rippleIntensityScale = 1,
  rippleSpeed = 0.3,
  rippleThickness = 0.1,
  speed = 0.5,
  transparent = true,
  variant = NO_LOOSE_STRING_VALUES.square,
}: PixelBlastProps): ResolvedPixelBlastProps {
  return {
    antialias,
    autoPauseOffscreen,
    color,
    edgeFade,
    enableRipples,
    liquid,
    liquidRadius,
    liquidStrength,
    liquidWobbleSpeed,
    noiseAmount,
    patternDensity,
    patternScale,
    pixelSize,
    pixelSizeJitter,
    rippleIntensityScale,
    rippleSpeed,
    rippleThickness,
    speed,
    transparent,
    variant,
  };
}

export function toRuntimeConfig({
  speed: _speed,
  ...config
}: ResolvedPixelBlastProps): PixelBlastRuntimeConfig {
  return config;
}
