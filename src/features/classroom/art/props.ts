// Furniture. Each painter returns a canvas whose bottom-centre is its world anchor.

import type { PropKind } from "../world";
import {
  PALETTE,
  createRng,
  makeCanvas,
  outlined,
  paintWoodSurface,
  polygon,
  roundedRect,
  softEllipse,
  verticalGradient,
  type Ctx,
} from "./canvas";

export type PaintedProp = { canvas: HTMLCanvasElement; width: number; height: number };

function drawLeg(ctx: Ctx, x: number, top: number, bottom: number, width = 11): void {
  roundedRect(ctx, x, top, width, bottom - top, 3);
  outlined(ctx, verticalGradient(ctx, top, bottom, PALETTE.white, PALETTE.mint), 2.2);
}

function paintStudentDesk(seed: number): PaintedProp {
  const width = 176;
  const height = 118;
  const { canvas, ctx } = makeCanvas(width, height);
  const rng = createRng(seed);
  const ground = height - 6;

  softEllipse(ctx, width / 2, ground - 2, 88, 15, 0.42);
  drawLeg(ctx, 24, 66, ground);
  drawLeg(ctx, width - 35, 66, ground);

  // Apron under the top.
  roundedRect(ctx, 16, 62, width - 32, 26, 4);
  outlined(ctx, verticalGradient(ctx, 62, 88, PALETTE.mint, PALETTE.mintDeep), 2.2);

  // The top, in slight perspective.
  polygon(ctx, [[22, 16], [width - 22, 16], [width - 8, 66], [8, 66]]);
  ctx.save();
  ctx.clip();
  paintWoodSurface(ctx, 0, 14, width, 56, rng, PALETTE.birchLight);
  const sheen = ctx.createLinearGradient(0, 16, width, 66);
  sheen.addColorStop(0, "rgba(255, 255, 255, 0.5)");
  sheen.addColorStop(0.5, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 14, width, 56);
  ctx.restore();
  polygon(ctx, [[22, 16], [width - 22, 16], [width - 8, 66], [8, 66]]);
  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = 2.4;
  ctx.stroke();

  // Lip of the front edge.
  roundedRect(ctx, 7, 64, width - 14, 7, 3);
  outlined(ctx, PALETTE.birch, 2);

  // Open notebook and pencil, nudged per desk so the row is not copy-pasted.
  const bookX = 50 + rng() * 24;
  polygon(ctx, [[bookX, 30], [bookX + 34, 30], [bookX + 36, 55], [bookX - 4, 55]]);
  outlined(ctx, PALETTE.white, 1.6);
  polygon(ctx, [[bookX + 34, 30], [bookX + 68, 30], [bookX + 76, 55], [bookX + 36, 55]]);
  outlined(ctx, "#f4f9ff", 1.6);
  ctx.strokeStyle = "rgba(80, 140, 150, 0.4)";
  ctx.lineWidth = 1.3;
  for (const lineY of [37, 43, 49]) {
    ctx.beginPath();
    ctx.moveTo(bookX + 6, lineY);
    ctx.lineTo(bookX + 30, lineY);
    ctx.moveTo(bookX + 42, lineY);
    ctx.lineTo(bookX + 66, lineY);
    ctx.stroke();
  }
  ctx.save();
  ctx.translate(width - 44, 42);
  ctx.rotate(-0.5);
  roundedRect(ctx, -15, -2.5, 30, 5, 2);
  outlined(ctx, PALETTE.sunny, 1.4);
  ctx.restore();

  return { canvas, width, height };
}

function paintChair(seed: number): PaintedProp {
  const width = 66;
  const height = 66;
  const { canvas, ctx } = makeCanvas(width, height);
  const rng = createRng(77 + seed);
  const seat = [PALETTE.coral, PALETTE.sky, PALETTE.lavender][seed % 3] ?? PALETTE.coral;
  const ground = height - 6;

  softEllipse(ctx, width / 2, ground - 1, 32, 8, 0.38);
  drawLeg(ctx, 12, 38, ground, 8);
  drawLeg(ctx, width - 20, 38, ground, 8);

  polygon(ctx, [[12, 26], [width - 12, 26], [width - 6, 44], [6, 44]]);
  ctx.save();
  ctx.clip();
  paintWoodSurface(ctx, 0, 24, width, 22, rng, seat);
  ctx.restore();
  polygon(ctx, [[12, 26], [width - 12, 26], [width - 6, 44], [6, 44]]);
  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = 2.2;
  ctx.stroke();

  roundedRect(ctx, 5, 42, width - 10, 6, 2.5);
  outlined(ctx, PALETTE.white, 2);
  return { canvas, width, height };
}

function paintTeacherDesk(): PaintedProp {
  const width = 250;
  const height = 134;
  const { canvas, ctx } = makeCanvas(width, height);
  const rng = createRng(31);
  const ground = height - 6;

  softEllipse(ctx, width / 2, ground - 2, 124, 17, 0.42);

  // Solid front panel.
  roundedRect(ctx, 12, 54, width - 24, ground - 54, 6);
  outlined(ctx, verticalGradient(ctx, 54, ground, PALETTE.sky, PALETTE.skyDeep), 2.4);
  for (const panelX of [26, width / 2 + 6]) {
    roundedRect(ctx, panelX, 68, width / 2 - 32, ground - 80, 5);
    ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
    ctx.fill();
    ctx.strokeStyle = "rgba(63, 113, 109, 0.32)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(panelX + (width / 2 - 32) / 2, 90, 3.6, 0, Math.PI * 2);
    outlined(ctx, PALETTE.sunny, 1.4);
  }

  polygon(ctx, [[24, 14], [width - 24, 14], [width - 6, 56], [6, 56]]);
  ctx.save();
  ctx.clip();
  paintWoodSurface(ctx, 0, 12, width, 48, rng, PALETTE.birchLight);
  ctx.restore();
  polygon(ctx, [[24, 14], [width - 24, 14], [width - 6, 56], [6, 56]]);
  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = 2.4;
  ctx.stroke();
  roundedRect(ctx, 4, 54, width - 8, 8, 3);
  outlined(ctx, PALETTE.birch, 2.2);

  // A stack of books, an apple and a mug.
  const stackX = 48;
  for (const [offset, color, bookWidth] of [[0, PALETTE.coral, 62], [-9, PALETTE.sky, 54], [-18, PALETTE.lavender, 46]] as const) {
    roundedRect(ctx, stackX + (62 - bookWidth) / 2, 36 + offset, bookWidth, 10, 2);
    outlined(ctx, color, 1.8);
  }
  ctx.beginPath();
  ctx.arc(width - 66, 38, 9, 0, Math.PI * 2);
  outlined(ctx, "#f07a80", 1.8);
  ctx.strokeStyle = PALETTE.leafDark;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(width - 66, 29);
  ctx.lineTo(width - 64, 24);
  ctx.stroke();
  roundedRect(ctx, width / 2 - 8, 26, 22, 22, 4);
  outlined(ctx, PALETTE.white, 1.8);
  ctx.beginPath();
  ctx.arc(width / 2 + 16, 37, 5.5, -1.3, 1.3);
  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = 1.8;
  ctx.stroke();

  return { canvas, width, height };
}

function paintStudyNook(): PaintedProp {
  const width = 206;
  const height = 150;
  const { canvas, ctx } = makeCanvas(width, height);
  const rng = createRng(53);
  const ground = height - 6;

  softEllipse(ctx, width / 2, ground - 2, 102, 16, 0.42);

  // A low round glow marks this as the spot to walk up to.
  const glow = ctx.createRadialGradient(width / 2, ground - 40, 6, width / 2, ground - 40, 96);
  glow.addColorStop(0, "rgba(216, 201, 240, 0.7)");
  glow.addColorStop(1, "rgba(216, 201, 240, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  drawLeg(ctx, 26, 80, ground);
  drawLeg(ctx, width - 37, 80, ground);
  polygon(ctx, [[22, 50], [width - 22, 50], [width - 8, 84], [8, 84]]);
  ctx.save();
  ctx.clip();
  paintWoodSurface(ctx, 0, 48, width, 40, rng, PALETTE.birchLight);
  ctx.restore();
  polygon(ctx, [[22, 50], [width - 22, 50], [width - 8, 84], [8, 84]]);
  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = 2.4;
  ctx.stroke();
  roundedRect(ctx, 6, 82, width - 12, 8, 3);
  outlined(ctx, PALETTE.birch, 2.2);

  // A warm desktop machine with a soft status lamp.
  roundedRect(ctx, 76, 20, 78, 48, 7);
  outlined(ctx, verticalGradient(ctx, 20, 68, PALETTE.white, "#e8e0f6"), 2.4);
  roundedRect(ctx, 84, 28, 62, 32, 4);
  outlined(ctx, verticalGradient(ctx, 28, 60, PALETTE.boardLight, PALETTE.board), 2);
  ctx.strokeStyle = PALETTE.sunny;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(90, 52);
  ctx.bezierCurveTo(104, 34, 118, 56, 140, 36);
  ctx.stroke();
  roundedRect(ctx, 106, 68, 18, 8, 2);
  outlined(ctx, PALETTE.lavender, 2);

  // Desk lamp.
  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = 3.4;
  ctx.beginPath();
  ctx.moveTo(40, 72);
  ctx.lineTo(44, 34);
  ctx.lineTo(62, 22);
  ctx.stroke();
  polygon(ctx, [[54, 16], [76, 26], [68, 42], [46, 30]]);
  outlined(ctx, PALETTE.coral, 2.2);
  ctx.beginPath();
  ctx.ellipse(40, 74, 12, 4, 0, 0, Math.PI * 2);
  outlined(ctx, PALETTE.white, 2);

  return { canvas, width, height };
}

function paintPlant(): PaintedProp {
  const width = 88;
  const height = 124;
  const { canvas, ctx } = makeCanvas(width, height);
  const rng = createRng(11);
  const ground = height - 6;

  softEllipse(ctx, width / 2, ground - 1, 36, 9, 0.42);
  const leaves: Array<[number, number, number]> = [];
  for (let i = 0; i < 15; i += 1) {
    leaves.push([-1.25 + (i / 14) * 2.5, 32 + rng() * 30, 0.3 + rng() * 0.2]);
  }
  leaves.sort((a, b) => a[1] - b[1]);
  leaves.forEach(([angle, length, spread], index) => {
    ctx.save();
    ctx.translate(width / 2, ground - 38);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(-length * spread, -length * 0.6, 0, -length);
    ctx.quadraticCurveTo(length * spread, -length * 0.6, 0, 0);
    ctx.closePath();
    outlined(ctx, index % 2 === 0 ? PALETTE.leaf : PALETTE.leafDark, 1.7);
    ctx.strokeStyle = "rgba(235, 255, 240, 0.55)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, -4);
    ctx.lineTo(0, -length * 0.82);
    ctx.stroke();
    ctx.restore();
  });

  polygon(ctx, [[20, ground - 42], [width - 20, ground - 42], [width - 26, ground], [26, ground]]);
  outlined(ctx, verticalGradient(ctx, ground - 42, ground, PALETTE.white, PALETTE.sky), 2.4);
  roundedRect(ctx, 16, ground - 48, width - 32, 10, 3);
  outlined(ctx, PALETTE.white, 2.2);
  return { canvas, width, height };
}

function paintBookcase(): PaintedProp {
  const width = 176;
  const height = 214;
  const { canvas, ctx } = makeCanvas(width, height);
  const rng = createRng(19);
  const ground = height - 4;

  softEllipse(ctx, width / 2, ground - 2, 90, 12, 0.42);
  roundedRect(ctx, 8, 6, width - 16, ground - 8, 6);
  outlined(ctx, verticalGradient(ctx, 6, ground, PALETTE.white, "#e6f4ee"), 2.6);
  roundedRect(ctx, 18, 16, width - 36, ground - 28, 3);
  ctx.fillStyle = "#dff1ea";
  ctx.fill();

  const colors = [PALETTE.coral, PALETTE.sunny, PALETTE.sky, PALETTE.mintDeep, PALETTE.lavender, PALETTE.coralDeep, PALETTE.skyDeep];
  const shelfHeight = 58;
  for (let shelf = 0; shelf < 3; shelf += 1) {
    const baseY = 18 + (shelf + 1) * shelfHeight;
    let x = 22;
    while (x < width - 34) {
      const bookWidth = 8 + rng() * 11;
      const bookHeight = 30 + rng() * 18;
      if (rng() < 0.12) {
        x += 10;
        continue;
      }
      const lean = rng() < 0.12 ? 0.08 : 0;
      ctx.save();
      ctx.translate(x, baseY);
      ctx.rotate(lean);
      roundedRect(ctx, 0, -bookHeight, bookWidth, bookHeight, 1.6);
      outlined(ctx, colors[Math.floor(rng() * colors.length)] ?? PALETTE.coral, 1.4);
      ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
      ctx.fillRect(1.8, -bookHeight + 6, bookWidth - 3.6, 2.5);
      ctx.restore();
      x += bookWidth + 1.2;
    }
    roundedRect(ctx, 14, baseY, width - 28, 7, 2);
    outlined(ctx, PALETTE.birchLight, 1.8);
  }
  return { canvas, width, height };
}

export function paintProp(kind: PropKind, seed: number): PaintedProp {
  switch (kind) {
    case "studentDesk":
      return paintStudentDesk(seed);
    case "chair":
      return paintChair(seed);
    case "teacherDesk":
      return paintTeacherDesk();
    case "studyNook":
      return paintStudyNook();
    case "plant":
      return paintPlant();
    case "bookcase":
      return paintBookcase();
  }
}
