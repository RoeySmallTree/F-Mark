const NO_LOOSE_STRING_VALUES = {
  value01: "01",
  wave: "wave",
} as const;

/* Quantise a -1..1 signal onto a ramp of glyphs. */
function ramped(v: number, ramp: string[]): string {
  const i = Math.floor((v * 0.5 + 0.5) * (ramp.length - 1e-9));
  return ramp[Math.max(0, Math.min(ramp.length - 1, i))]!;
}

function grid(h: number, w: number): string[][] {
  return Array.from({ length: h }, () => Array<string>(w).fill(" "));
}

function join(g: string[][]): string {
  return g.map((r) => r.join("")).join("\n");
}

export type ArtGen = (f: number, w: number) => string;

function waveArt(f: number, w: number): string {
  const H = 3;
  const g = grid(H, w);
  for (let x = 0; x < w; x++) {
    const v =
      Math.sin(x * 0.5 - f * 0.35) * 0.6 + Math.sin(x * 0.21 - f * 0.2) * 0.4;
    g[Math.round((1 - (v * 0.5 + 0.5)) * (H - 1))]![x] = "•";
  }
  return join(g);
}

function blocksArt(f: number, w: number): string {
  const ramp = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];
  let s = "";
  for (let x = 0; x < w; x++) {
    const v = (Math.sin(x * 0.55 + f * 0.5) + Math.sin(x * 0.26 + f * 0.85)) / 2;
    s += ramped(v, ramp);
  }
  return s;
}

function brailleArt(f: number, w: number): string {
  const ramp = ["⣀", "⣄", "⣆", "⣇", "⣧", "⣷", "⣿"];
  let s = "";
  for (let x = 0; x < w; x++) s += ramped(Math.sin(x * 0.45 - f * 0.3), ramp);
  return s;
}

function matrixArt(f: number, w: number): string {
  const set = NO_LOOSE_STRING_VALUES.value01;
  const lines: string[] = [];
  for (let y = 0; y < 2; y++) {
    let s = "";
    for (let x = 0; x < w; x++) {
      const n = Math.sin(x * 12.99 + y * 78.23 + f * 0.9) * 43758.5;
      const seed = n - Math.floor(n);
      s += seed < 0.18 ? " " : set[Math.floor(seed * set.length)]!;
    }
    lines.push(s);
  }
  return lines.join("\n");
}

function sonarGlyph(x: number, cx: number, rad: number): string {
  const d = x - cx;
  const ad = Math.abs(d);
  if (ad === 0) return "•";
  const radii = rad > 4 ? [rad, rad - 4] : [rad];
  return rad > 0 && radii.includes(ad) ? (d < 0 ? "(" : ")") : " ";
}

function sonarArt(f: number, w: number): string {
  const cx = Math.floor(w / 2);
  const r = f % 16;
  const rad = r <= 8 ? r : 16 - r;
  let s = "";
  for (let x = 0; x < w; x++) s += sonarGlyph(x, cx, rad);
  return s;
}

function fillArt(f: number, w: number): string {
  const H = 4;
  const caps = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];
  const g = grid(H, w);
  for (let x = 0; x < w; x++) {
    const level = (Math.sin(x * 0.42 - f * 0.33) * 0.5 + 0.5) * H;
    const full = Math.floor(level);
    for (let k = 0; k < H; k++) {
      const row = H - 1 - k;
      if (k < full) g[row]![x] = "█";
      else if (k === full)
        g[row]![x] = caps[Math.max(0, Math.min(7, Math.floor((level - full) * 8)))]!;
    }
  }
  return join(g);
}

function dnaArt(f: number, w: number): string {
  const H = 5;
  const g = grid(H, w);
  for (let x = 0; x < w; x++) {
    const a = Math.sin(x * 0.5 - f * 0.32);
    const b = Math.sin(x * 0.5 - f * 0.32 + Math.PI);
    const ya = Math.round((1 - (a * 0.5 + 0.5)) * (H - 1));
    const yb = Math.round((1 - (b * 0.5 + 0.5)) * (H - 1));
    if (x % 3 === 0) {
      const lo = Math.min(ya, yb);
      const hi = Math.max(ya, yb);
      for (let y = lo + 1; y < hi; y++) g[y]![x] = ":";
    }
    g[ya]![x] = a >= 0 ? "O" : "o";
    g[yb]![x] = b >= 0 ? "O" : "o";
  }
  return join(g);
}

function ecgArt(f: number, w: number): string {
  const H = 3;
  const beat = [0, 0, 0, 0, 0, 0, 1, 2, 0, -1, 1, 0, 0, 0, 0, 0, 0, 0];
  const g = grid(H, w);
  const rowOf = (v: number): number => H - 1 - Math.max(0, Math.min(H - 1, v));
  for (let x = 0; x < w; x++) {
    const row = rowOf(beat[(x + f) % beat.length]!);
    const prev = x > 0 ? rowOf(beat[(x - 1 + f) % beat.length]!) : row;
    g[row]![x] = row < prev ? "/" : row > prev ? "\\" : "_";
  }
  return join(g);
}

function rippleArt(f: number, w: number): string {
  const H = 3;
  const ramp = " .:-=+*#%@";
  const lines: string[] = [];
  for (let y = 0; y < H; y++) {
    let s = "";
    for (let x = 0; x < w; x++) {
      const v =
        Math.sin(x * 0.4 - f * 0.3) +
        Math.sin(x * 0.23 + y * 0.9 + f * 0.2) +
        Math.sin(y * 1.3 - f * 0.15);
      s += ramp[Math.max(0, Math.min(ramp.length - 1, Math.floor(((v / 3) * 0.5 + 0.5) * ramp.length)))]!;
    }
    lines.push(s);
  }
  return lines.join("\n");
}

function cometArt(f: number, w: number): string {
  const H = 3;
  const g = grid(H, w);
  const yAt = (x: number): number =>
    Math.round((1 - (Math.sin(x * 0.55) * 0.5 + 0.5)) * (H - 1));
  for (let x = 0; x < w; x++) g[yAt(x)]![x] = "·";
  const trail = ["●", "o", "+", "·"];
  for (let k = 0; k < trail.length; k++) {
    const x = (((f - k) % w) + w) % w;
    g[yAt(x)]![x] = trail[k]!;
  }
  return join(g);
}

const ART: Record<string, ArtGen> = {
  wave: waveArt,
  blocks: blocksArt,
  braille: brailleArt,
  matrix: matrixArt,
  sonar: sonarArt,
  fill: fillArt,
  dna: dnaArt,
  ecg: ecgArt,
  ripple: rippleArt,
  comet: cometArt,
};

const ART_KINDS = Object.keys(ART);

export const GREEN_KINDS = new Set(["matrix", "ecg"]);

let lastKind: string | null = null;

export function pickKind(): string {
  if (ART_KINDS.length <= 1) {
    lastKind = ART_KINDS[0] ?? NO_LOOSE_STRING_VALUES.wave;
    return lastKind;
  }
  let k = ART_KINDS[Math.floor(Math.random() * ART_KINDS.length)]!;
  while (k === lastKind) {
    k = ART_KINDS[Math.floor(Math.random() * ART_KINDS.length)]!;
  }
  lastKind = k;
  return k;
}

export function renderArt(kind: string, frame: number, cols: number): string {
  return (ART[kind] ?? ART.wave!)(frame, cols);
}

