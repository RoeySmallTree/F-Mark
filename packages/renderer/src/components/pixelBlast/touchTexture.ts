import * as THREE from "three";

const NO_LOOSE_STRING_VALUES = {
  value2d: "2d",
  rgba255001: "rgba(255,0,0,1)",
  black: "black",
} as const;

interface TouchPoint {
  age: number;
  force: number;
  vx: number;
  vy: number;
  x: number;
  y: number;
}

interface NormalizedPoint {
  x: number;
  y: number;
}

export interface TouchTextureHandle {
  canvas: HTMLCanvasElement;
  texture: THREE.Texture;
  addTouch(norm: NormalizedPoint): void;
  update(): void;
  radiusScale: number;
  size: number;
}

const TOUCH_TEXTURE_SIZE = 64;
const MAX_TOUCH_AGE = 64;
const TOUCH_SPEED = 1 / MAX_TOUCH_AGE;

export function createTouchTexture(): TouchTextureHandle {
  const canvas = document.createElement("canvas");
  canvas.width = TOUCH_TEXTURE_SIZE;
  canvas.height = TOUCH_TEXTURE_SIZE;
  const ctx = canvas.getContext(NO_LOOSE_STRING_VALUES.value2d);
  if (!ctx) throw new Error("2D context not available");

  clearTextureCanvas(ctx, canvas);
  const texture = createTexture(canvas);
  const trail: TouchPoint[] = [];
  let last: NormalizedPoint | null = null;
  let radius = 0.1 * TOUCH_TEXTURE_SIZE;

  return {
    canvas,
    texture,
    addTouch(norm: NormalizedPoint): void {
      const touch = createTouchPoint(norm, last);
      if (!touch) return;
      last = { x: norm.x, y: norm.y };
      trail.push(touch);
    },
    update(): void {
      clearTextureCanvas(ctx, canvas);
      advanceTrail(trail);
      trail.forEach((point) => drawPoint(ctx, point, radius));
      texture.needsUpdate = true;
    },
    get radiusScale(): number {
      return radius / (0.1 * TOUCH_TEXTURE_SIZE);
    },
    set radiusScale(value: number) {
      radius = 0.1 * TOUCH_TEXTURE_SIZE * value;
    },
    size: TOUCH_TEXTURE_SIZE,
  };
}

function createTexture(canvas: HTMLCanvasElement): THREE.Texture {
  const texture = new THREE.Texture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

function createTouchPoint(
  norm: NormalizedPoint,
  last: NormalizedPoint | null,
): TouchPoint | null {
  const motion = resolveMotion(norm, last);
  if (!motion) return null;
  return {
    age: 0,
    force: motion.force,
    vx: motion.vx,
    vy: motion.vy,
    x: norm.x,
    y: norm.y,
  };
}

function resolveMotion(
  norm: NormalizedPoint,
  last: NormalizedPoint | null,
): Pick<TouchPoint, "force" | "vx" | "vy"> | null {
  if (!last) return { force: 0, vx: 0, vy: 0 };
  const dx = norm.x - last.x;
  const dy = norm.y - last.y;
  if (dx === 0 && dy === 0) return null;
  const distanceSquared = dx * dx + dy * dy;
  const distance = Math.sqrt(distanceSquared);
  return {
    force: Math.min(distanceSquared * 10000, 1),
    vx: dx / (distance || 1),
    vy: dy / (distance || 1),
  };
}

function advanceTrail(trail: TouchPoint[]): void {
  for (let index = trail.length - 1; index >= 0; index--) {
    const point = trail[index]!;
    const force = point.force * TOUCH_SPEED * (1 - point.age / MAX_TOUCH_AGE);
    point.x += point.vx * force;
    point.y += point.vy * force;
    point.age++;
    if (point.age > MAX_TOUCH_AGE) trail.splice(index, 1);
  }
}

function drawPoint(
  ctx: CanvasRenderingContext2D,
  point: TouchPoint,
  radius: number,
): void {
  const pos = {
    x: point.x * TOUCH_TEXTURE_SIZE,
    y: (1 - point.y) * TOUCH_TEXTURE_SIZE,
  };
  const intensity = resolveIntensity(point) * point.force;
  const color = `${((point.vx + 1) / 2) * 255}, ${((point.vy + 1) / 2) * 255}, ${
    intensity * 255
  }`;
  const offset = TOUCH_TEXTURE_SIZE * 5;
  ctx.shadowOffsetX = offset;
  ctx.shadowOffsetY = offset;
  ctx.shadowBlur = radius;
  ctx.shadowColor = `rgba(${color},${0.22 * intensity})`;
  ctx.beginPath();
  ctx.fillStyle = NO_LOOSE_STRING_VALUES.rgba255001;
  ctx.arc(pos.x - offset, pos.y - offset, radius, 0, Math.PI * 2);
  ctx.fill();
}

function resolveIntensity(point: TouchPoint): number {
  if (point.age < MAX_TOUCH_AGE * 0.3) {
    return easeOutSine(point.age / (MAX_TOUCH_AGE * 0.3));
  }
  return (
    easeOutQuad(1 - (point.age - MAX_TOUCH_AGE * 0.3) / (MAX_TOUCH_AGE * 0.7)) ||
    0
  );
}

function clearTextureCanvas(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
): void {
  ctx.fillStyle = NO_LOOSE_STRING_VALUES.black;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function easeOutSine(t: number): number {
  return Math.sin((t * Math.PI) / 2);
}

function easeOutQuad(t: number): number {
  return -t * (t - 2);
}
