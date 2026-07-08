import { EffectComposer } from "postprocessing";
import * as THREE from "three";
import { FRAGMENT_SRC, MAX_CLICKS, VERTEX_SRC } from "./constants.js";
import type { ShapeVariant } from "./constants.js";
import {
  createPixelBlastPostprocessing,
  setEffectUniform,
  syncComposerTime,
  syncLiquidEffect,
  type PostprocessingState,
} from "./effects.js";
import { canCreateWebGlContext } from "./support.js";
import type { TouchTextureHandle } from "./touchTexture.js";
import {
  createPixelBlastUniforms,
  recordRippleClick,
  updatePixelBlastUniforms,
  type PixelBlastUniforms,
} from "./uniforms.js";

const NO_LOOSE_STRING_VALUES = {
  highPerformance: "high-performance",
  utime: "uTime",
} as const;

export interface PixelBlastRuntimeConfig {
  antialias: boolean;
  autoPauseOffscreen: boolean;
  color: string;
  edgeFade: number;
  enableRipples: boolean;
  liquid: boolean;
  liquidRadius: number;
  liquidStrength: number;
  liquidWobbleSpeed: number;
  noiseAmount: number;
  patternDensity: number;
  patternScale: number;
  pixelSize: number;
  pixelSizeJitter: number;
  rippleIntensityScale: number;
  rippleSpeed: number;
  rippleThickness: number;
  transparent: boolean;
  variant: ShapeVariant;
}

export interface PixelBlastReinitConfig {
  antialias: boolean;
  liquid: boolean;
  noiseAmount: number;
}

export interface PixelBlastRuntimeHandle extends PostprocessingState {
  autoPauseOffscreen: boolean;
  camera: THREE.OrthographicCamera;
  clickIx: number;
  timer: THREE.Timer;
  material: THREE.ShaderMaterial;
  pixelSize: number;
  quad: THREE.Mesh;
  raf: number;
  renderer: THREE.WebGLRenderer;
  resizeObserver: ResizeObserver;
  scene: THREE.Scene;
  timeOffset: number;
  uniforms: PixelBlastUniforms;
  removePointerListeners(): void;
}

interface RuntimeRefs {
  speedRef: { current: number };
  visibilityRef: { current: { visible: boolean } };
}

interface SyncRuntimeInput {
  config: PixelBlastRuntimeConfig;
  container: HTMLElement;
  prevConfig: PixelBlastReinitConfig | null;
  refs: RuntimeRefs;
  runtime: PixelBlastRuntimeHandle | null;
}

interface SyncRuntimeResult {
  mustReinit: boolean;
  prevConfig: PixelBlastReinitConfig | null;
  runtime: PixelBlastRuntimeHandle | null;
}

interface CleanupRuntimeInput {
  container: HTMLElement;
  preserveRuntime: boolean;
  runtime: PixelBlastRuntimeHandle | null;
}

interface PointerPixels {
  fx: number;
  fy: number;
  h: number;
  w: number;
}

export function syncPixelBlastRuntime({
  config,
  container,
  prevConfig,
  refs,
  runtime,
}: SyncRuntimeInput): SyncRuntimeResult {
  const nextConfig = toReinitConfig(config);
  const mustReinit = shouldReinit(runtime, prevConfig, nextConfig);

  if (!mustReinit) {
    updatePixelBlastRuntime(runtime!, config);
    return { mustReinit, prevConfig: nextConfig, runtime };
  }

  if (runtime) disposePixelBlastRuntime(runtime, container);
  const nextRuntime = createPixelBlastRuntime({ config, container, refs });
  return {
    mustReinit,
    prevConfig: nextRuntime ? nextConfig : null,
    runtime: nextRuntime,
  };
}

export function cleanupPixelBlastRuntime({
  container,
  preserveRuntime,
  runtime,
}: CleanupRuntimeInput): PixelBlastRuntimeHandle | null {
  if (runtime && preserveRuntime) return runtime;
  if (!runtime) return null;
  disposePixelBlastRuntime(runtime, container);
  return null;
}

function createPixelBlastRuntime(input: {
  config: PixelBlastRuntimeConfig;
  container: HTMLElement;
  refs: RuntimeRefs;
}): PixelBlastRuntimeHandle | null {
  if (!canCreateWebGlContext()) return null;

  const renderer = createRenderer(input.config);
  if (!renderer) return null;

  const { config, container, refs } = input;
  configureRenderer(renderer, config.transparent);
  container.appendChild(renderer.domElement);

  const uniforms = createPixelBlastUniforms({
    ...config,
    pixelRatio: renderer.getPixelRatio(),
  });
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const material = createMaterial(uniforms);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  scene.add(quad);

  const postprocessing = createPixelBlastPostprocessing({
    camera,
    config,
    renderer,
    scene,
  });
  const runtime = buildRuntime({
    camera,
    config,
    material,
    postprocessing,
    quad,
    renderer,
    scene,
    uniforms,
  });

  attachPointerListeners(runtime);
  resizeRuntimeSurface(container, runtime);
  runtime.resizeObserver = new ResizeObserver(() => {
    resizeRuntimeSurface(container, runtime);
  });
  runtime.resizeObserver.observe(container);
  runtime.raf = requestAnimationFrame((timestamp) =>
    animateRuntime(runtime, refs, timestamp),
  );
  return runtime;
}

function createPixelBlastTimer(): THREE.Timer {
  const timer = new THREE.Timer();
  timer.connect(document);
  return timer;
}

function buildRuntime(input: {
  camera: THREE.OrthographicCamera;
  config: PixelBlastRuntimeConfig;
  material: THREE.ShaderMaterial;
  postprocessing: PostprocessingState;
  quad: THREE.Mesh;
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  uniforms: PixelBlastUniforms;
}): PixelBlastRuntimeHandle {
  return {
    ...input.postprocessing,
    autoPauseOffscreen: input.config.autoPauseOffscreen,
    camera: input.camera,
    clickIx: 0,
    timer: createPixelBlastTimer(),
    material: input.material,
    pixelSize: input.config.pixelSize,
    quad: input.quad,
    raf: 0,
    renderer: input.renderer,
    resizeObserver: createNoopResizeObserver(),
    scene: input.scene,
    timeOffset: randomFloat() * 1000,
    uniforms: input.uniforms,
    removePointerListeners: () => undefined,
  };
}

function createRenderer(
  config: Pick<PixelBlastRuntimeConfig, "antialias">,
): THREE.WebGLRenderer | null {
  const canvas = document.createElement("canvas");
  try {
    return new THREE.WebGLRenderer({
      alpha: true,
      antialias: config.antialias,
      canvas,
      powerPreference: NO_LOOSE_STRING_VALUES.highPerformance,
    });
  } catch {
    return null;
  }
}

function configureRenderer(
  renderer: THREE.WebGLRenderer,
  transparent: boolean,
): void {
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  if (transparent) renderer.setClearAlpha(0);
  else renderer.setClearColor(0x000000, 1);
}

function createMaterial(
  uniforms: PixelBlastUniforms,
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    fragmentShader: FRAGMENT_SRC,
    glslVersion: THREE.GLSL3,
    transparent: true,
    uniforms,
    vertexShader: VERTEX_SRC,
  });
}

function updatePixelBlastRuntime(
  runtime: PixelBlastRuntimeHandle,
  config: PixelBlastRuntimeConfig,
): void {
  runtime.autoPauseOffscreen = config.autoPauseOffscreen;
  runtime.pixelSize = config.pixelSize;
  updatePixelBlastUniforms(runtime.uniforms, {
    ...config,
    pixelRatio: runtime.renderer.getPixelRatio(),
  });
  configureClearColor(runtime.renderer, config.transparent);
  syncLiquidEffect(runtime.liquidEffect, config);
  if (runtime.touch) runtime.touch.radiusScale = config.liquidRadius;
}

function disposePixelBlastRuntime(
  runtime: PixelBlastRuntimeHandle,
  container: HTMLElement,
): void {
  runtime.resizeObserver.disconnect();
  runtime.removePointerListeners();
  cancelAnimationFrame(runtime.raf);
  runtime.quad.geometry.dispose();
  runtime.material.dispose();
  runtime.composer?.dispose();
  runtime.renderer.dispose();
  runtime.timer.dispose();
  runtime.renderer.forceContextLoss();
  if (runtime.renderer.domElement.parentElement === container) {
    container.removeChild(runtime.renderer.domElement);
  }
}

function animateRuntime(
  runtime: PixelBlastRuntimeHandle,
  refs: RuntimeRefs,
  timestamp: number,
): void {
  if (runtime.autoPauseOffscreen && !refs.visibilityRef.current.visible) {
    runtime.raf = requestAnimationFrame((nextTimestamp) =>
      animateRuntime(runtime, refs, nextTimestamp),
    );
    return;
  }

  runtime.timer.update(timestamp);
  const time =
    runtime.timeOffset + runtime.timer.getElapsed() * refs.speedRef.current;
  runtime.uniforms.uTime!.value = time;
  setEffectUniform({ effect: runtime.liquidEffect, name: NO_LOOSE_STRING_VALUES.utime, value: time });
  if (runtime.composer) {
    runtime.touch?.update();
    syncComposerTime(runtime.composer, time);
    runtime.composer.render();
  } else {
    runtime.renderer.render(runtime.scene, runtime.camera);
  }
  runtime.raf = requestAnimationFrame((nextTimestamp) =>
    animateRuntime(runtime, refs, nextTimestamp),
  );
}

function attachPointerListeners(runtime: PixelBlastRuntimeHandle): void {
  const onPointerDown = (event: PointerEvent): void => {
    const { fx, fy } = mapToPixels(runtime.renderer, event);
    recordRippleClick(runtime.uniforms, runtime.clickIx, fx, fy);
    runtime.clickIx = (runtime.clickIx + 1) % MAX_CLICKS;
  };
  const onPointerMove = (event: PointerEvent): void => {
    if (!runtime.touch) return;
    addTouchFromPointer(runtime.renderer, runtime.touch, event);
  };
  runtime.renderer.domElement.addEventListener("pointerdown", onPointerDown, {
    passive: true,
  });
  runtime.renderer.domElement.addEventListener("pointermove", onPointerMove, {
    passive: true,
  });
  runtime.removePointerListeners = () => {
    runtime.renderer.domElement.removeEventListener("pointerdown", onPointerDown);
    runtime.renderer.domElement.removeEventListener("pointermove", onPointerMove);
  };
}

function addTouchFromPointer(
  renderer: THREE.WebGLRenderer,
  touch: TouchTextureHandle,
  event: PointerEvent,
): void {
  const { fx, fy, h, w } = mapToPixels(renderer, event);
  touch.addTouch({ x: fx / w, y: fy / h });
}

function mapToPixels(
  renderer: THREE.WebGLRenderer,
  event: PointerEvent,
): PointerPixels {
  const rect = renderer.domElement.getBoundingClientRect();
  const scaleX = renderer.domElement.width / rect.width;
  const scaleY = renderer.domElement.height / rect.height;
  const fx = (event.clientX - rect.left) * scaleX;
  const fy = (rect.height - (event.clientY - rect.top)) * scaleY;
  return {
    fx,
    fy,
    h: renderer.domElement.height,
    w: renderer.domElement.width,
  };
}

function resizeRuntimeSurface(
  container: HTMLElement,
  runtime: Pick<
    PixelBlastRuntimeHandle,
    "composer" | "pixelSize" | "renderer" | "uniforms"
  >,
): void {
  const width = container.clientWidth || 1;
  const height = container.clientHeight || 1;
  runtime.renderer.setSize(width, height, false);
  const resolution = runtime.uniforms.uResolution!.value as THREE.Vector2;
  resolution.set(
    runtime.renderer.domElement.width,
    runtime.renderer.domElement.height,
  );
  resizeComposer(runtime.composer, runtime.renderer);
  runtime.uniforms.uPixelSize!.value =
    runtime.pixelSize * runtime.renderer.getPixelRatio();
}

function resizeComposer(
  composer: EffectComposer | undefined,
  renderer: THREE.WebGLRenderer,
): void {
  composer?.setSize(renderer.domElement.width, renderer.domElement.height);
}

function configureClearColor(
  renderer: THREE.WebGLRenderer,
  transparent: boolean,
): void {
  if (transparent) renderer.setClearAlpha(0);
  else renderer.setClearColor(0x000000, 1);
}

function shouldReinit(
  runtime: PixelBlastRuntimeHandle | null,
  prevConfig: PixelBlastReinitConfig | null,
  nextConfig: PixelBlastReinitConfig,
): boolean {
  if (!runtime) return true;
  if (!prevConfig) return false;
  return (
    prevConfig.antialias !== nextConfig.antialias ||
    prevConfig.liquid !== nextConfig.liquid ||
    prevConfig.noiseAmount !== nextConfig.noiseAmount
  );
}

function toReinitConfig(
  config: PixelBlastRuntimeConfig,
): PixelBlastReinitConfig {
  return {
    antialias: config.antialias,
    liquid: config.liquid,
    noiseAmount: config.noiseAmount,
  };
}

function randomFloat(): number {
  if (typeof window !== "undefined" && window.crypto?.getRandomValues) {
    const u32 = new Uint32Array(1);
    window.crypto.getRandomValues(u32);
    return u32[0]! / 0xffffffff;
  }
  return Math.random();
}

function createNoopResizeObserver(): ResizeObserver {
  return {
    disconnect: () => undefined,
    observe: () => undefined,
    unobserve: () => undefined,
  } as ResizeObserver;
}
