import * as THREE from "three";
import { MAX_CLICKS, SHAPE_MAP, type ShapeVariant } from "./constants.js";

export type PixelBlastUniforms = Record<string, THREE.IUniform>;

export interface PixelBlastUniformConfig {
  color: string;
  edgeFade: number;
  enableRipples: boolean;
  patternDensity: number;
  patternScale: number;
  pixelRatio: number;
  pixelSize: number;
  pixelSizeJitter: number;
  rippleIntensityScale: number;
  rippleSpeed: number;
  rippleThickness: number;
  variant: ShapeVariant;
}

export function createPixelBlastUniforms(
  config: PixelBlastUniformConfig,
): PixelBlastUniforms {
  return {
    uClickPos: {
      value: Array.from(
        { length: MAX_CLICKS },
        () => new THREE.Vector2(-1, -1),
      ),
    },
    uClickTimes: { value: new Float32Array(MAX_CLICKS) },
    uColor: { value: new THREE.Color(config.color) },
    uDensity: { value: config.patternDensity },
    uEdgeFade: { value: config.edgeFade },
    uEnableRipples: { value: config.enableRipples ? 1 : 0 },
    uPixelJitter: { value: config.pixelSizeJitter },
    uPixelSize: { value: config.pixelSize * config.pixelRatio },
    uResolution: { value: new THREE.Vector2(0, 0) },
    uRippleIntensity: { value: config.rippleIntensityScale },
    uRippleSpeed: { value: config.rippleSpeed },
    uRippleThickness: { value: config.rippleThickness },
    uScale: { value: config.patternScale },
    uShapeType: { value: SHAPE_MAP[config.variant] ?? 0 },
    uTime: { value: 0 },
  };
}

export function updatePixelBlastUniforms(
  uniforms: PixelBlastUniforms,
  config: PixelBlastUniformConfig,
): void {
  uniforms.uShapeType!.value = SHAPE_MAP[config.variant] ?? 0;
  uniforms.uPixelSize!.value = config.pixelSize * config.pixelRatio;
  (uniforms.uColor!.value as THREE.Color).set(config.color);
  uniforms.uScale!.value = config.patternScale;
  uniforms.uDensity!.value = config.patternDensity;
  uniforms.uPixelJitter!.value = config.pixelSizeJitter;
  uniforms.uEnableRipples!.value = config.enableRipples ? 1 : 0;
  uniforms.uRippleIntensity!.value = config.rippleIntensityScale;
  uniforms.uRippleThickness!.value = config.rippleThickness;
  uniforms.uRippleSpeed!.value = config.rippleSpeed;
  uniforms.uEdgeFade!.value = config.edgeFade;
}

export function recordRippleClick(
  uniforms: PixelBlastUniforms,
  clickIndex: number,
  fx: number,
  fy: number,
): void {
  const positions = uniforms.uClickPos!.value as THREE.Vector2[];
  positions[clickIndex]!.set(fx, fy);
  const times = uniforms.uClickTimes!.value as Float32Array;
  times[clickIndex] = uniforms.uTime!.value as number;
}
