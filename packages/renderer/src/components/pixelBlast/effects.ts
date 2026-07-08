import {
  Effect,
  EffectComposer,
  EffectPass,
  RenderPass,
} from "postprocessing";
import * as THREE from "three";
import {
  createTouchTexture,
  type TouchTextureHandle,
} from "./touchTexture.js";

export interface PostprocessingConfig {
  liquid: boolean;
  liquidStrength: number;
  liquidRadius: number;
  liquidWobbleSpeed: number;
  noiseAmount: number;
}

export interface PostprocessingState {
  composer: EffectComposer | undefined;
  liquidEffect: Effect | undefined;
  touch: TouchTextureHandle | undefined;
}

interface EffectPassWithEffects {
  effects?: Effect[];
}

const LIQUID_FRAGMENT = `
    uniform sampler2D uTexture;
    uniform float uStrength;
    uniform float uTime;
    uniform float uFreq;

    void mainUv(inout vec2 uv) {
      vec4 tex = texture2D(uTexture, uv);
      float vx = tex.r * 2.0 - 1.0;
      float vy = tex.g * 2.0 - 1.0;
      float intensity = tex.b;

      float wave = 0.5 + 0.5 * sin(uTime * uFreq + intensity * 6.2831853);

      float amt = uStrength * intensity * wave;

      uv += vec2(vx, vy) * amt;
    }
    `;

const NOISE_FRAGMENT =
  "uniform float uTime; uniform float uAmount; float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453);} void mainUv(inout vec2 uv){} void mainImage(const in vec4 inputColor,const in vec2 uv,out vec4 outputColor){ float n=hash(floor(uv*vec2(1920.0,1080.0))+floor(uTime*60.0)); float g=(n-0.5)*uAmount; outputColor=inputColor+vec4(vec3(g),0.0);} ";

const effectNames = {
  liquid: "LiquidEffect",
  noise: "NoiseEffect",
} as const;

const effectUniformNames = {
  texture: "uTexture",
  strength: "uStrength",
  time: "uTime",
  frequency: "uFreq",
  amount: "uAmount",
} as const;

interface CreatePostprocessingInput {
  camera: THREE.Camera;
  config: PostprocessingConfig;
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
}

interface ComposerInput {
  camera: THREE.Camera;
  composer: EffectComposer | undefined;
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
}

interface EffectUniformInput {
  effect: Effect | undefined;
  name: string;
  value: number;
}

function createLiquidEffect(
  texture: THREE.Texture,
  opts?: { strength?: number; freq?: number },
): Effect {
  return new Effect(effectNames.liquid, LIQUID_FRAGMENT, {
    uniforms: new Map<string, THREE.Uniform>([
      [effectUniformNames.texture, new THREE.Uniform(texture)],
      [effectUniformNames.strength, new THREE.Uniform(opts?.strength ?? 0.025)],
      [effectUniformNames.time, new THREE.Uniform(0)],
      [effectUniformNames.frequency, new THREE.Uniform(opts?.freq ?? 4.5)],
    ]),
  });
}

export function createPixelBlastPostprocessing({
  camera,
  config,
  renderer,
  scene,
}: CreatePostprocessingInput): PostprocessingState {
  let composer: EffectComposer | undefined;
  let touch: TouchTextureHandle | undefined;
  let liquidEffect: Effect | undefined;

  if (config.liquid) {
    touch = createTouchTexture();
    touch.radiusScale = config.liquidRadius;
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    liquidEffect = createLiquidEffect(touch.texture, {
      strength: config.liquidStrength,
      freq: config.liquidWobbleSpeed,
    });
    addEffectPass({ camera, composer, effect: liquidEffect });
  }

  if (config.noiseAmount > 0) {
    composer = ensureComposer({ camera, composer, renderer, scene });
    addNoisePass(camera, composer, config.noiseAmount);
  }

  if (composer) {
    composer.setSize(renderer.domElement.width, renderer.domElement.height);
  }

  return { composer, liquidEffect, touch };
}

export function syncComposerTime(
  composer: EffectComposer | undefined,
  time: number,
): void {
  composer?.passes.forEach((pass) => {
    const effects = (pass as unknown as EffectPassWithEffects).effects;
    effects?.forEach((effect) =>
      setEffectUniform({ effect, name: effectUniformNames.time, value: time }),
    );
  });
}

export function syncLiquidEffect(
  liquidEffect: Effect | undefined,
  config: Pick<PostprocessingConfig, "liquidStrength" | "liquidWobbleSpeed">,
): void {
  setEffectUniform({
    effect: liquidEffect,
    name: effectUniformNames.strength,
    value: config.liquidStrength,
  });
  setEffectUniform({
    effect: liquidEffect,
    name: effectUniformNames.frequency,
    value: config.liquidWobbleSpeed,
  });
}

export function setEffectUniform({
  effect,
  name,
  value,
}: EffectUniformInput): void {
  const uniform = effect?.uniforms.get(name);
  if (uniform) uniform.value = value;
}

function addEffectPass(input: {
  camera: THREE.Camera;
  composer: EffectComposer;
  effect: Effect;
}): void {
  const effectPass = new EffectPass(input.camera, input.effect);
  effectPass.renderToScreen = true;
  input.composer.addPass(effectPass);
}

function addNoisePass(
  camera: THREE.Camera,
  composer: EffectComposer,
  noiseAmount: number,
): void {
  const noiseEffect = createNoiseEffect(noiseAmount);
  const noisePass = new EffectPass(camera, noiseEffect);
  noisePass.renderToScreen = true;
  if (composer.passes.length > 0) {
    composer.passes.forEach((pass) => (pass.renderToScreen = false));
  }
  composer.addPass(noisePass);
}

function createNoiseEffect(noiseAmount: number): Effect {
  return new Effect(effectNames.noise, NOISE_FRAGMENT, {
    uniforms: new Map<string, THREE.Uniform>([
      [effectUniformNames.time, new THREE.Uniform(0)],
      [effectUniformNames.amount, new THREE.Uniform(noiseAmount)],
    ]),
  });
}

function ensureComposer({
  camera,
  composer,
  renderer,
  scene,
}: ComposerInput): EffectComposer {
  if (composer) return composer;
  const nextComposer = new EffectComposer(renderer);
  nextComposer.addPass(new RenderPass(scene, camera));
  return nextComposer;
}
