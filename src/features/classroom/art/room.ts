// Paints the fixed room shell: walls, windows, blackboard, floor and rug.

import { FLOOR_BOTTOM, FLOOR_TOP, WORLD_HEIGHT, WORLD_WIDTH } from "../world";
import {
  PALETTE,
  createRng,
  makeCanvas,
  outlined,
  polygon,
  roundedRect,
  speckle,
  softEllipse,
  verticalGradient,
  type Ctx,
} from "./canvas";

// The back wall is inset; side walls run from its corners out to the diorama edge.
const BACK_LEFT = 74;
const BACK_RIGHT = WORLD_WIDTH - 74;
const WALL_TOP = 26;
const FRONT_INSET = 22;

function paintBackdrop(ctx: Ctx): void {
  ctx.fillStyle = "#dff1f8";
  ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
  const glow = ctx.createRadialGradient(600, 380, 120, 600, 380, 780);
  glow.addColorStop(0, "rgba(255, 255, 255, 0.85)");
  glow.addColorStop(1, "rgba(170, 216, 232, 0.4)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
}

function paintFloor(ctx: Ctx, rng: () => number): void {
  // Pastel tiles laid out in true perspective: columns converge toward the back wall.
  const rows: number[] = [FLOOR_TOP];
  let rowHeight = 30;
  while ((rows[rows.length - 1] ?? FLOOR_BOTTOM) < FLOOR_BOTTOM) {
    rows.push(Math.min(FLOOR_BOTTOM, (rows[rows.length - 1] ?? FLOOR_TOP) + rowHeight));
    rowHeight += 5;
  }
  const columns = 13;
  const xAt = (column: number, y: number): number => {
    const depth = (y - FLOOR_TOP) / (FLOOR_BOTTOM - FLOOR_TOP);
    const left = BACK_LEFT + (FRONT_INSET - BACK_LEFT) * depth;
    const right = BACK_RIGHT + (WORLD_WIDTH - FRONT_INSET - BACK_RIGHT) * depth;
    return left + ((right - left) * column) / columns;
  };

  for (let row = 0; row < rows.length - 1; row += 1) {
    const top = rows[row] ?? FLOOR_TOP;
    const bottom = rows[row + 1] ?? FLOOR_BOTTOM;
    for (let column = 0; column < columns; column += 1) {
      const even = (row + column) % 2 === 0;
      const accent = !even && rng() < 0.14;
      polygon(ctx, [
        [xAt(column, top), top],
        [xAt(column + 1, top), top],
        [xAt(column + 1, bottom), bottom],
        [xAt(column, bottom), bottom],
      ]);
      ctx.fillStyle = verticalGradient(
        ctx,
        top,
        bottom,
        even ? "#fdfefa" : accent ? "#d9edf8" : "#e3f5ec",
        even ? "#f6faf3" : accent ? "#cbe5f4" : "#d6f0e3",
      );
      ctx.fill();
      ctx.strokeStyle = "rgba(120, 178, 170, 0.34)";
      ctx.lineWidth = 1.3;
      ctx.stroke();
    }
    // A soft highlight along each row reads as polish on the tile.
    ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
    ctx.fillRect(xAt(0, top), top, xAt(columns, top) - xAt(0, top), 1.4);
  }
}

function paintRug(ctx: Ctx, rng: () => number): void {
  const cx = 600;
  const cy = 594;
  softEllipse(ctx, cx, cy + 8, 330, 118, 0.13);

  const bands: ReadonlyArray<readonly [number, string]> = [
    [1, PALETTE.lavender],
    [0.93, PALETTE.white],
    [0.86, PALETTE.coral],
    [0.76, PALETTE.white],
    [0.68, PALETTE.sky],
    [0.56, PALETTE.white],
    [0.48, PALETTE.mint],
  ];
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, 0.36);
  for (const [scale, color] of bands) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, 0, 300 * scale, 0, Math.PI * 2);
    ctx.fill();
  }
  // Woven loops catch the light along each ring.
  for (let i = 0; i < 2400; i += 1) {
    const angle = rng() * Math.PI * 2;
    const radius = Math.sqrt(rng()) * 298;
    ctx.fillStyle = rng() < 0.5 ? "rgba(255, 255, 255, 0.2)" : `rgba(${PALETTE.shadow}, 0.05)`;
    ctx.fillRect(Math.cos(angle) * radius, Math.sin(angle) * radius, 2.4, 4);
  }
  ctx.restore();
}

function paintWall(ctx: Ctx, rng: () => number): void {
  // Plaster.
  ctx.fillStyle = verticalGradient(ctx, WALL_TOP, FLOOR_TOP, PALETTE.wallLight, PALETTE.wallDark);
  ctx.fillRect(BACK_LEFT, WALL_TOP, BACK_RIGHT - BACK_LEFT, FLOOR_TOP - WALL_TOP);
  ctx.save();
  ctx.beginPath();
  ctx.rect(BACK_LEFT, WALL_TOP, BACK_RIGHT - BACK_LEFT, FLOOR_TOP - WALL_TOP);
  ctx.clip();
  speckle(ctx, BACK_LEFT, WALL_TOP, BACK_RIGHT - BACK_LEFT, FLOOR_TOP - WALL_TOP, 1400, rng, "120, 170, 165", 0.05);
  ctx.restore();

  // Wainscot with vertical beading.
  const wainscotTop = 172;
  ctx.fillStyle = verticalGradient(ctx, wainscotTop, FLOOR_TOP, PALETTE.wainscotLight, PALETTE.wainscotDark);
  ctx.fillRect(BACK_LEFT, wainscotTop, BACK_RIGHT - BACK_LEFT, FLOOR_TOP - wainscotTop);
  for (let x = BACK_LEFT + 22; x < BACK_RIGHT; x += 44) {
    ctx.fillStyle = "rgba(90, 165, 140, 0.32)";
    ctx.fillRect(x, wainscotTop + 6, 1.6, FLOOR_TOP - wainscotTop - 14);
    ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
    ctx.fillRect(x + 1.6, wainscotTop + 6, 1.2, FLOOR_TOP - wainscotTop - 14);
  }
  ctx.fillStyle = PALETTE.trim;
  ctx.fillRect(BACK_LEFT, wainscotTop - 4, BACK_RIGHT - BACK_LEFT, 7);
  ctx.fillStyle = `rgba(${PALETTE.shadow}, 0.22)`;
  ctx.fillRect(BACK_LEFT, wainscotTop + 3, BACK_RIGHT - BACK_LEFT, 3);

  // Baseboard.
  ctx.fillStyle = PALETTE.white;
  ctx.fillRect(BACK_LEFT, FLOOR_TOP - 14, BACK_RIGHT - BACK_LEFT, 14);
  ctx.fillStyle = "rgba(120, 178, 170, 0.35)";
  ctx.fillRect(BACK_LEFT, FLOOR_TOP - 14, BACK_RIGHT - BACK_LEFT, 2);

  // Side walls, shaded away from the windows.
  const sides: ReadonlyArray<{ points: ReadonlyArray<readonly [number, number]>; light: string; dark: string }> = [
    {
      points: [[FRONT_INSET, 0], [BACK_LEFT, WALL_TOP], [BACK_LEFT, FLOOR_TOP], [FRONT_INSET, FLOOR_BOTTOM]],
      light: "#f5faf4",
      dark: "#e6f3ec",
    },
    {
      points: [[WORLD_WIDTH - FRONT_INSET, 0], [BACK_RIGHT, WALL_TOP], [BACK_RIGHT, FLOOR_TOP], [WORLD_WIDTH - FRONT_INSET, FLOOR_BOTTOM]],
      light: "#f1f8f2",
      dark: "#e0f0e9",
    },
  ];
  for (const side of sides) {
    polygon(ctx, side.points);
    ctx.fillStyle = verticalGradient(ctx, 0, FLOOR_BOTTOM, side.light, side.dark);
    ctx.fill();
  }

  // Corner shading where planes meet: this does most of the work of reading as a room.
  for (const [x, direction] of [[BACK_LEFT, 1], [BACK_RIGHT, -1]] as const) {
    const gradient = ctx.createLinearGradient(x, 0, x + direction * 42, 0);
    gradient.addColorStop(0, `rgba(${PALETTE.shadow}, 0.16)`);
    gradient.addColorStop(1, `rgba(${PALETTE.shadow}, 0)`);
    ctx.fillStyle = gradient;
    ctx.fillRect(Math.min(x, x + direction * 42), WALL_TOP, 42, FLOOR_TOP - WALL_TOP);
  }
  const ceilingShade = ctx.createLinearGradient(0, WALL_TOP, 0, WALL_TOP + 40);
  ceilingShade.addColorStop(0, `rgba(${PALETTE.shadow}, 0.12)`);
  ceilingShade.addColorStop(1, `rgba(${PALETTE.shadow}, 0)`);
  ctx.fillStyle = ceilingShade;
  ctx.fillRect(BACK_LEFT, WALL_TOP, BACK_RIGHT - BACK_LEFT, 40);

  // Ceiling beam across the top of the diorama.
  polygon(ctx, [[0, 0], [WORLD_WIDTH, 0], [BACK_RIGHT, WALL_TOP], [BACK_LEFT, WALL_TOP]]);
  ctx.fillStyle = verticalGradient(ctx, 0, WALL_TOP, PALETTE.sky, PALETTE.skyDeep);
  ctx.fill();

  const floorShade = ctx.createLinearGradient(0, FLOOR_TOP, 0, FLOOR_TOP + 56);
  floorShade.addColorStop(0, `rgba(${PALETTE.shadow}, 0.18)`);
  floorShade.addColorStop(1, `rgba(${PALETTE.shadow}, 0)`);
  polygon(ctx, [
    [BACK_LEFT, FLOOR_TOP],
    [BACK_RIGHT, FLOOR_TOP],
    [BACK_RIGHT + 8, FLOOR_TOP + 56],
    [BACK_LEFT - 8, FLOOR_TOP + 56],
  ]);
  ctx.fillStyle = floorShade;
  ctx.fill();
}

function paintWindow(ctx: Ctx, x: number, y: number, w: number, h: number, rng: () => number): void {
  const sky = ctx.createLinearGradient(0, y, 0, y + h);
  sky.addColorStop(0, "#8fd0f2");
  sky.addColorStop(0.72, "#cfeefa");
  sky.addColorStop(1, "#effbf5");
  roundedRect(ctx, x, y, w, h, 8);
  ctx.save();
  ctx.clip();
  ctx.fillStyle = sky;
  ctx.fillRect(x, y, w, h);
  // Soft clouds, then a tree line outside.
  ctx.fillStyle = "rgba(255, 255, 255, 0.82)";
  for (let i = 0; i < 3; i += 1) {
    const cloudX = x + 16 + rng() * (w - 40);
    const cloudY = y + 14 + rng() * 26;
    for (const [dx, dy, radius] of [[0, 0, 9], [11, -4, 11], [23, 0, 8]] as const) {
      ctx.beginPath();
      ctx.arc(cloudX + dx, cloudY + dy, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  for (let i = 0; i < 26; i += 1) {
    ctx.fillStyle = i % 3 === 0 ? PALETTE.leaf : i % 3 === 1 ? PALETTE.leafDark : "#9fdba6";
    ctx.beginPath();
    ctx.arc(x + rng() * w, y + h - rng() * 28, 12 + rng() * 14, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "rgba(255, 255, 255, 0.26)";
  polygon(ctx, [[x + 10, y], [x + 38, y], [x + 4, y + h], [x - 24, y + h]]);
  ctx.fill();
  ctx.restore();

  ctx.strokeStyle = PALETTE.trim;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(x + w / 2, y);
  ctx.lineTo(x + w / 2, y + h);
  ctx.moveTo(x, y + h * 0.46);
  ctx.lineTo(x + w, y + h * 0.46);
  ctx.stroke();

  roundedRect(ctx, x - 7, y - 7, w + 14, h + 14, 10);
  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = 2;
  ctx.stroke();
  roundedRect(ctx, x - 4, y - 4, w + 8, h + 8, 8);
  ctx.strokeStyle = PALETTE.trim;
  ctx.lineWidth = 6;
  ctx.stroke();

  roundedRect(ctx, x - 14, y + h + 6, w + 28, 9, 4);
  outlined(ctx, PALETTE.trim, 2);

  // Curtains tied back to either side.
  for (const side of [-1, 1] as const) {
    const edge = side === -1 ? x - 12 : x + w + 12;
    ctx.beginPath();
    ctx.moveTo(edge, y - 10);
    ctx.lineTo(edge - side * 36, y - 10);
    ctx.bezierCurveTo(edge - side * 34, y + h * 0.4, edge - side * 12, y + h * 0.56, edge - side * 16, y + h + 4);
    ctx.lineTo(edge, y + h + 4);
    ctx.closePath();
    outlined(ctx, verticalGradient(ctx, y, y + h, PALETTE.coral, PALETTE.coralDeep), 2);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.55)";
    ctx.lineWidth = 2;
    for (const fold of [10, 21]) {
      ctx.beginPath();
      ctx.moveTo(edge - side * fold, y - 6);
      ctx.bezierCurveTo(edge - side * fold, y + h * 0.3, edge - side * (fold * 0.5), y + h * 0.5, edge - side * (fold * 0.55), y + h);
      ctx.stroke();
    }
  }
  ctx.fillStyle = PALETTE.skyDeep;
  ctx.fillRect(x - 40, y - 15, w + 80, 6);
}

function paintBlackboard(ctx: Ctx, rng: () => number): void {
  const x = 432;
  const y = 54;
  const w = 416;
  const h = 118;

  softEllipse(ctx, x + w / 2, y + h + 8, w * 0.56, 14, 0.12);
  roundedRect(ctx, x - 12, y - 12, w + 24, h + 24, 9);
  outlined(ctx, PALETTE.white, 2.4);

  roundedRect(ctx, x, y, w, h, 4);
  ctx.fillStyle = verticalGradient(ctx, y, y + h, PALETTE.boardLight, PALETTE.board);
  ctx.fill();
  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.save();
  roundedRect(ctx, x, y, w, h, 4);
  ctx.clip();
  // Half-wiped chalk dust.
  for (let i = 0; i < 16; i += 1) {
    ctx.strokeStyle = `rgba(245, 240, 225, ${0.02 + rng() * 0.05})`;
    ctx.lineWidth = 12 + rng() * 20;
    const startX = x + rng() * w;
    const startY = y + rng() * h;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.quadraticCurveTo(startX + 60, startY - 24 + rng() * 48, startX + 140, startY + rng() * 12);
    ctx.stroke();
  }

  // Chalk sketch of a little network learning: the room's one bit of storytelling.
  const nodes: Array<[number, number]> = [
    [x + 66, y + 34], [x + 66, y + 84],
    [x + 150, y + 26], [x + 150, y + 60], [x + 150, y + 94],
    [x + 234, y + 44], [x + 234, y + 80],
  ];
  ctx.strokeStyle = "rgba(248, 244, 228, 0.42)";
  ctx.lineWidth = 1.4;
  const layers = [[0, 1], [2, 3, 4], [5, 6]] as const;
  for (let layer = 0; layer < layers.length - 1; layer += 1) {
    for (const from of layers[layer] ?? []) {
      for (const to of layers[layer + 1] ?? []) {
        const a = nodes[from];
        const b = nodes[to];
        if (!a || !b) continue;
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
        ctx.stroke();
      }
    }
  }
  nodes.forEach(([nodeX, nodeY], index) => {
    ctx.fillStyle = index >= 5 ? PALETTE.sunny : PALETTE.board;
    ctx.beginPath();
    ctx.arc(nodeX, nodeY, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = PALETTE.chalk;
    ctx.lineWidth = 2;
    ctx.stroke();
  });

  // A hand-drawn loss curve.
  ctx.strokeStyle = PALETTE.chalk;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + 292, y + 22);
  ctx.lineTo(x + 292, y + 98);
  ctx.lineTo(x + 392, y + 98);
  ctx.stroke();
  ctx.strokeStyle = PALETTE.sunny;
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(x + 298, y + 28);
  ctx.bezierCurveTo(x + 316, y + 72, x + 340, y + 84, x + 386, y + 88);
  ctx.stroke();
  ctx.restore();

  // Chalk tray.
  roundedRect(ctx, x - 18, y + h + 8, w + 36, 8, 3);
  outlined(ctx, PALETTE.birchLight, 2);
  for (const [offset, color] of [[40, PALETTE.white], [58, PALETTE.coral], [340, PALETTE.sunny]] as const) {
    roundedRect(ctx, x + offset, y + h + 3, 15, 5, 2);
    outlined(ctx, color, 1.2);
  }
}

function paintWallDecor(ctx: Ctx): void {
  // Round clock.
  const clockX = 908;
  const clockY = 74;
  softEllipse(ctx, clockX + 3, clockY + 6, 30, 26, 0.12);
  ctx.beginPath();
  ctx.arc(clockX, clockY, 25, 0, Math.PI * 2);
  outlined(ctx, PALETTE.coral, 2.4);
  ctx.beginPath();
  ctx.arc(clockX, clockY, 19, 0, Math.PI * 2);
  outlined(ctx, PALETTE.white, 1.6);
  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(clockX, clockY);
  ctx.lineTo(clockX + 8, clockY - 7);
  ctx.moveTo(clockX, clockY);
  ctx.lineTo(clockX - 2, clockY - 14);
  ctx.stroke();

  // Bunting along the top of the wall.
  ctx.strokeStyle = PALETTE.inkSoft;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(92, 40);
  ctx.quadraticCurveTo(156, 66, 226, 40);
  ctx.stroke();
  const flags = [PALETTE.coral, PALETTE.sky, PALETTE.mint, PALETTE.lavender];
  for (let i = 0; i < 5; i += 1) {
    const t = (i + 0.5) / 5;
    const px = 92 + (226 - 92) * t;
    const py = 40 + 4 * t * (1 - t) * 13;
    polygon(ctx, [[px - 9, py], [px + 9, py], [px, py + 19]]);
    outlined(ctx, flags[i % flags.length] ?? PALETTE.coral, 1.5);
  }
}

function paintWindowLight(ctx: Ctx): void {
  // Sunlight falling through the two windows onto the floor.
  ctx.save();
  try {
    ctx.filter = "blur(10px)";
  } catch {
    // Older browsers just get a harder edge.
  }
  ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
  for (const [left, right] of [[248, 398], [946, 1096]] as const) {
    const lean = -130;
    polygon(ctx, [
      [left, FLOOR_TOP + 6],
      [right, FLOOR_TOP + 6],
      [right + lean, FLOOR_TOP + 300],
      [left + lean, FLOOR_TOP + 300],
    ]);
    ctx.fill();
  }
  ctx.restore();
}

function paintFrontEdge(ctx: Ctx): void {
  // The cut-away front of the diorama: a thick wall section with a soft top.
  const top = FLOOR_BOTTOM;
  ctx.fillStyle = verticalGradient(ctx, top, WORLD_HEIGHT, "#ffffff", "#cfeadf");
  ctx.fillRect(0, top, WORLD_WIDTH, WORLD_HEIGHT - top);
  ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
  ctx.fillRect(0, top, WORLD_WIDTH, 3);
  ctx.fillStyle = `rgba(${PALETTE.shadow}, 0.16)`;
  ctx.fillRect(0, top - 5, WORLD_WIDTH, 5);
}

export function paintRoom(): HTMLCanvasElement {
  const rng = createRng(20261109);
  const { canvas, ctx } = makeCanvas(WORLD_WIDTH, WORLD_HEIGHT);
  paintBackdrop(ctx);
  paintFloor(ctx, rng);
  paintRug(ctx, rng);
  paintWall(ctx, rng);
  paintWindow(ctx, 278, 62, 96, 96, rng);
  paintWindow(ctx, 974, 62, 96, 96, rng);
  paintBlackboard(ctx, rng);
  paintWallDecor(ctx);
  paintWindowLight(ctx);
  paintFrontEdge(ctx);
  return canvas;
}
