// Small drawing vocabulary shared by the classroom painters.

export type Ctx = CanvasRenderingContext2D;

/** Textures are painted larger than their world size so they stay crisp when zoomed. */
export const ART_SCALE = 2;

// Bright daylight palette from docs/design/ART_DIRECTION.md. Whites stay white
// and shadows are cool, so nothing drifts toward sepia.
export const PALETTE = {
  ink: "#3f716d",
  inkSoft: "rgba(63, 113, 109, 0.55)",
  shadow: "52, 98, 104",
  wallLight: "#fdfefb",
  wallDark: "#f0f7ef",
  wainscotLight: "#c9eedd",
  wainscotDark: "#b3e2cd",
  trim: "#ffffff",
  birchLight: "#f6eee0",
  birch: "#e9dcc6",
  mint: "#bfe8d4",
  mintDeep: "#9fd6c0",
  sky: "#bedff3",
  skyDeep: "#9fcde8",
  coral: "#f3a3a6",
  coralDeep: "#e98a90",
  lavender: "#d8c9f0",
  sunny: "#ffd98a",
  board: "#3f8f7f",
  boardLight: "#57aa97",
  chalk: "rgba(255, 255, 255, 0.92)",
  leaf: "#7cc48f",
  leafDark: "#56a877",
  white: "#ffffff",
} as const;

export function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A canvas whose drawing units are world pixels regardless of ART_SCALE. */
export function makeCanvas(width: number, height: number): { canvas: HTMLCanvasElement; ctx: Ctx } {
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(width * ART_SCALE);
  canvas.height = Math.ceil(height * ART_SCALE);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas is unavailable");
  ctx.scale(ART_SCALE, ART_SCALE);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  return { canvas, ctx };
}

export function roundedRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

export function polygon(ctx: Ctx, points: ReadonlyArray<readonly [number, number]>): void {
  ctx.beginPath();
  points.forEach(([x, y], index) => (index === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
}

export function verticalGradient(ctx: Ctx, y0: number, y1: number, from: string, to: string): CanvasGradient {
  const gradient = ctx.createLinearGradient(0, y0, 0, y1);
  gradient.addColorStop(0, from);
  gradient.addColorStop(1, to);
  return gradient;
}

export function softEllipse(ctx: Ctx, cx: number, cy: number, rx: number, ry: number, alpha: number): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, ry / rx);
  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  gradient.addColorStop(0, `rgba(${PALETTE.shadow}, ${alpha})`);
  gradient.addColorStop(0.6, `rgba(${PALETTE.shadow}, ${alpha * 0.6})`);
  gradient.addColorStop(1, `rgba(${PALETTE.shadow}, 0)`);
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function outlined(ctx: Ctx, fill: string | CanvasGradient, lineWidth = 2.4, stroke: string = PALETTE.ink): void {
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}

/** Fine paint-like mottling, clipped by whatever clip is active. */
export function speckle(ctx: Ctx, x: number, y: number, w: number, h: number, count: number, rng: () => number, rgb: string, alpha: number): void {
  for (let i = 0; i < count; i += 1) {
    ctx.fillStyle = `rgba(${rgb}, ${alpha * (0.4 + rng() * 0.6)})`;
    const size = 0.5 + rng() * 1.6;
    ctx.fillRect(x + rng() * w, y + rng() * h, size, size);
  }
}

export function paintWoodSurface(ctx: Ctx, x: number, y: number, w: number, h: number, rng: () => number, base: string = PALETTE.birch): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = base;
  ctx.fillRect(x, y, w, h);
  const lines = Math.ceil(h / 3);
  for (let i = 0; i < lines; i += 1) {
    const lineY = y + (i + rng()) * (h / lines);
    ctx.strokeStyle = `rgba(${PALETTE.shadow}, ${0.05 + rng() * 0.12})`;
    ctx.lineWidth = 0.6 + rng() * 0.9;
    ctx.beginPath();
    ctx.moveTo(x, lineY);
    ctx.bezierCurveTo(x + w * 0.3, lineY + rng() * 3 - 1.5, x + w * 0.7, lineY + rng() * 3 - 1.5, x + w, lineY);
    ctx.stroke();
  }
  ctx.restore();
}
