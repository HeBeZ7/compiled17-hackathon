// Characters: the default student, the alpaca teacher, and user-image standees.

import type { Facing } from "../movement";
import { ART_SCALE, PALETTE, makeCanvas, outlined, roundedRect, softEllipse, type Ctx } from "./canvas";

export const STUDENT_FRAME = { width: 96, height: 120, footX: 48, footY: 112 };
export const STUDENT_FACINGS: readonly Facing[] = ["down", "up", "left", "right"];
/** Column order in the sheet: standing, left foot forward, right foot forward. */
export const STUDENT_POSES = [0, 1, -1] as const;

const SKIN = "#ffe3cc";
const HAIR = "#6c5a8c";
const COAT = "#f3a3a6";
const COAT_DARK = "#e98a90";
const TROUSERS = "#a5d3ef";
const SHOE = "#7cc9ae";
const HEAD_RADIUS = 33;

function paintLeg(ctx: Ctx, x: number, footY: number, lift: number): void {
  roundedRect(ctx, x - 6, footY - 19 - lift, 12, 15, 5);
  outlined(ctx, TROUSERS, 2.2);
  ctx.beginPath();
  ctx.ellipse(x, footY - 4 - lift, 9, 6, 0, 0, Math.PI * 2);
  outlined(ctx, SHOE, 2.2);
}

function paintStudent(ctx: Ctx, facing: Facing, pose: number): void {
  const cx = STUDENT_FRAME.footX;
  const footY = STUDENT_FRAME.footY;
  const headY = footY - 66 - (pose === 0 ? 0 : 3);
  const sideView = facing === "left" || facing === "right";
  const towardLeft = facing === "left" ? -1 : 1;

  // Legs: in profile they overlap, seen head-on they sit side by side.
  const legGap = sideView ? 5 : 10;
  paintLeg(ctx, cx - legGap, footY, pose > 0 ? 5 : 0);
  paintLeg(ctx, cx + legGap, footY, pose < 0 ? 5 : 0);

  if (facing === "up") {
    roundedRect(ctx, cx - 17, footY - 46, 34, 26, 9);
    outlined(ctx, PALETTE.lavender, 2.2);
  }

  // Coat.
  ctx.beginPath();
  ctx.moveTo(cx - 16, footY - 46);
  ctx.quadraticCurveTo(cx - 23, footY - 24, cx - 20, footY - 15);
  ctx.quadraticCurveTo(cx, footY - 11, cx + 20, footY - 15);
  ctx.quadraticCurveTo(cx + 23, footY - 24, cx + 16, footY - 46);
  ctx.closePath();
  outlined(ctx, COAT, 2.4);
  if (facing === "down") {
    ctx.strokeStyle = COAT_DARK;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, footY - 42);
    ctx.lineTo(cx, footY - 14);
    ctx.stroke();
    for (const buttonY of [-34, -24]) {
      ctx.beginPath();
      ctx.arc(cx + 5, footY + buttonY, 2, 0, Math.PI * 2);
      outlined(ctx, PALETTE.white, 1.2);
    }
  }

  // Arms swing against the legs.
  const armSwing = pose * 5;
  const arms: ReadonlyArray<readonly [number, number]> = sideView
    ? [[cx + towardLeft * 2, armSwing]]
    : [[cx - 22, -armSwing], [cx + 22, armSwing]];
  for (const [armX, swing] of arms) {
    roundedRect(ctx, armX - 5.5, footY - 43 + swing * 0.3, 11, 22, 5.5);
    outlined(ctx, COAT, 2.2);
    ctx.beginPath();
    ctx.arc(armX, footY - 21 + swing * 0.8, 5, 0, Math.PI * 2);
    outlined(ctx, SKIN, 2);
  }

  // Head: deliberately much bigger than the body.
  ctx.beginPath();
  ctx.arc(cx, headY, HEAD_RADIUS, 0, Math.PI * 2);
  outlined(ctx, SKIN, 2.6);

  // Hair: full from behind, a fringe from the front, swept back in profile.
  const R = HEAD_RADIUS;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, headY, R, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = HAIR;
  if (facing === "up") {
    ctx.fillRect(cx - R, headY - R, R * 2, R * 2);
  } else if (sideView) {
    ctx.fillRect(cx - R, headY - R, R * 2, 19);
    ctx.fillRect(facing === "left" ? cx + 5 : cx - R, headY - R, R - 5, R + 2);
  } else {
    ctx.beginPath();
    ctx.moveTo(cx - R, headY - R);
    ctx.lineTo(cx + R, headY - R);
    ctx.lineTo(cx + R, headY - 2);
    ctx.quadraticCurveTo(cx + 16, headY - 17, cx + 5, headY - 8);
    ctx.quadraticCurveTo(cx - 11, headY - 19, cx - R, headY - 2);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  ctx.beginPath();
  ctx.arc(cx, headY, R, 0, Math.PI * 2);
  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = 2.6;
  ctx.stroke();

  if (facing === "up") return;

  // Face.
  const eyeY = headY + 7;
  const eyes = sideView ? [cx + towardLeft * 16] : [cx - 14, cx + 14];
  for (const eyeX of eyes) {
    ctx.fillStyle = PALETTE.ink;
    ctx.beginPath();
    ctx.ellipse(eyeX, eyeY, 4.4, 5.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(eyeX + 1.4, eyeY - 2.2, 1.7, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "rgba(243, 163, 166, 0.65)";
  for (const blushX of sideView ? [cx + towardLeft * 10] : [cx - 22, cx + 22]) {
    ctx.beginPath();
    ctx.ellipse(blushX, eyeY + 9, 6, 3.6, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  const mouthX = sideView ? cx + towardLeft * 19 : cx;
  ctx.arc(mouthX, eyeY + 8, 4, 0.2, Math.PI - 0.2);
  ctx.stroke();
}

export function paintStudentSheet(): HTMLCanvasElement {
  const { width, height } = STUDENT_FRAME;
  const { canvas, ctx } = makeCanvas(width * STUDENT_POSES.length, height * STUDENT_FACINGS.length);
  STUDENT_FACINGS.forEach((facing, row) => {
    STUDENT_POSES.forEach((pose, column) => {
      ctx.save();
      ctx.translate(column * width, row * height);
      paintStudent(ctx, facing, pose);
      ctx.restore();
    });
  });
  return canvas;
}

export const TEACHER_FRAME = { width: 132, height: 184, footX: 66, footY: 176 };

function paintWoolTuft(ctx: Ctx, cx: number, cy: number, radius: number, puffs: number, fill: string): void {
  // The outline is stroked first so that overlapping puffs merge into one fleece.
  const positions = Array.from({ length: puffs }, (_, index) => {
    const angle = (index / puffs) * Math.PI * 2;
    return [cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius * 0.86] as const;
  });
  const puffRadius = radius * 0.52;
  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = 5;
  for (const [x, y] of positions) {
    ctx.beginPath();
    ctx.arc(x, y, puffRadius, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = fill;
  for (const [x, y] of positions) {
    ctx.beginPath();
    ctx.arc(x, y, puffRadius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
}

function paintTeacher(ctx: Ctx, blink: boolean): void {
  const cx = TEACHER_FRAME.footX;
  const footY = TEACHER_FRAME.footY;
  const wool = "#fdfefb";
  const muzzle = "#ffffff";

  for (const offset of [-13, 13]) {
    roundedRect(ctx, cx + offset - 8, footY - 34, 16, 34, 7);
    outlined(ctx, "#eef6f2", 2.4);
    ctx.beginPath();
    ctx.ellipse(cx + offset, footY - 3, 10, 5, 0, 0, Math.PI * 2);
    outlined(ctx, PALETTE.lavender, 2.2);
  }

  // Sage cardigan over a fleece body.
  paintWoolTuft(ctx, cx, footY - 58, 34, 11, wool);
  ctx.beginPath();
  ctx.moveTo(cx - 28, footY - 86);
  ctx.quadraticCurveTo(cx - 40, footY - 54, cx - 32, footY - 28);
  ctx.quadraticCurveTo(cx, footY - 20, cx + 32, footY - 28);
  ctx.quadraticCurveTo(cx + 40, footY - 54, cx + 28, footY - 86);
  ctx.closePath();
  outlined(ctx, PALETTE.mint, 2.6);
  ctx.beginPath();
  ctx.moveTo(cx - 10, footY - 86);
  ctx.lineTo(cx, footY - 60);
  ctx.lineTo(cx + 10, footY - 86);
  ctx.closePath();
  outlined(ctx, wool, 2);
  ctx.strokeStyle = PALETTE.mintDeep;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx, footY - 60);
  ctx.lineTo(cx, footY - 24);
  ctx.stroke();
  for (const buttonY of [-52, -40, -28]) {
    ctx.beginPath();
    ctx.arc(cx + 5, footY + buttonY, 2.6, 0, Math.PI * 2);
    outlined(ctx, PALETTE.coral, 1.3);
  }

  // Long neck.
  roundedRect(ctx, cx - 17, footY - 122, 34, 44, 15);
  outlined(ctx, wool, 2.6);

  // Ears sit behind the head.
  for (const side of [-1, 1] as const) {
    ctx.save();
    ctx.translate(cx + side * 25, footY - 150);
    ctx.rotate(side * 0.34);
    ctx.beginPath();
    ctx.ellipse(0, -14, 9, 20, 0, 0, Math.PI * 2);
    outlined(ctx, wool, 2.6);
    ctx.fillStyle = "#f9c9cc";
    ctx.beginPath();
    ctx.ellipse(0, -12, 4.5, 13, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Head with a tuft on top.
  const headY = footY - 134;
  ctx.beginPath();
  ctx.ellipse(cx, headY, 31, 32, 0, 0, Math.PI * 2);
  outlined(ctx, wool, 2.8);
  paintWoolTuft(ctx, cx, headY - 28, 15, 7, "#ffffff");

  ctx.beginPath();
  ctx.ellipse(cx, headY + 15, 18, 13.5, 0, 0, Math.PI * 2);
  outlined(ctx, muzzle, 2.2);
  ctx.fillStyle = "#5e6f8a";
  ctx.beginPath();
  ctx.ellipse(cx, headY + 10, 5, 3.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(cx, headY + 13);
  ctx.lineTo(cx, headY + 18);
  ctx.moveTo(cx - 7, headY + 19);
  ctx.quadraticCurveTo(cx, headY + 25, cx + 7, headY + 19);
  ctx.stroke();

  // Eyes behind round glasses.
  const eyeY = headY - 6;
  for (const side of [-1, 1] as const) {
    const eyeX = cx + side * 15;
    if (blink) {
      ctx.strokeStyle = PALETTE.ink;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.arc(eyeX, eyeY - 1, 4.4, 0.3, Math.PI - 0.3);
      ctx.stroke();
    } else {
      ctx.fillStyle = PALETTE.ink;
      ctx.beginPath();
      ctx.ellipse(eyeX, eyeY, 3.8, 4.8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(eyeX + 1.2, eyeY - 1.8, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "rgba(243, 163, 166, 0.55)";
    ctx.beginPath();
    ctx.ellipse(cx + side * 22, eyeY + 12, 5.5, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(eyeX, eyeY, 10.5, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(cx - 4.5, eyeY);
  ctx.quadraticCurveTo(cx, eyeY - 3, cx + 4.5, eyeY);
  ctx.stroke();
}

export function paintTeacherSheet(): HTMLCanvasElement {
  const { width, height } = TEACHER_FRAME;
  const { canvas, ctx } = makeCanvas(width * 2, height);
  paintTeacher(ctx, false);
  ctx.translate(width, 0);
  paintTeacher(ctx, true);
  return canvas;
}

export function paintShadow(): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(76, 28);
  softEllipse(ctx, 38, 14, 36, 13, 0.5);
  return canvas;
}

export function paintFoot(): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(26, 16);
  ctx.beginPath();
  ctx.ellipse(13, 8, 10, 6, 0, 0, Math.PI * 2);
  outlined(ctx, SHOE, 2.2);
  return canvas;
}

/** Speech-bubble marker floating above something that can be used. */
export function paintPromptBubble(): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(58, 56);
  roundedRect(ctx, 5, 4, 48, 38, 15);
  ctx.moveTo(23, 41);
  ctx.lineTo(29, 52);
  ctx.lineTo(36, 41);
  outlined(ctx, PALETTE.white, 2.6);
  ctx.fillStyle = PALETTE.white;
  ctx.fillRect(24, 38, 11, 5);
  ctx.fillStyle = PALETTE.coral;
  for (const x of [17, 29, 41]) {
    ctx.beginPath();
    ctx.arc(x, 23, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  return canvas;
}

export type AvatarInput = "drawing" | "photo";

export const STANDEE_FRAME = { width: 112, height: 132, footX: 56, footY: 124 };

function trimmedBounds(image: CanvasImageSource, width: number, height: number): { x: number; y: number; w: number; h: number } {
  const probe = document.createElement("canvas");
  probe.width = width;
  probe.height = height;
  const context = probe.getContext("2d", { willReadFrequently: true });
  if (!context) return { x: 0, y: 0, w: width, h: height };
  context.drawImage(image, 0, 0, width, height);
  const { data } = context.getImageData(0, 0, width, height);
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if ((data[(y * width + x) * 4 + 3] ?? 0) < 16) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < minX) return { x: 0, y: 0, w: width, h: height };
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/**
 * Turns a user's image into a cut-out standee.
 *
 * A drawing keeps its own silhouette and gains a sticker border. A photo render
 * already carries its own transparent background and white sticker outline, so
 * it is drawn whole, with its aspect ratio kept and no crop or frame added.
 */
export function paintAvatarStandee(image: HTMLImageElement, input: AvatarInput): HTMLCanvasElement {
  const { width, height, footX, footY } = STANDEE_FRAME;
  const { canvas, ctx } = makeCanvas(width, height);
  const maxW = width - 16;
  const maxH = footY - 12;
  const naturalW = image.naturalWidth;
  const naturalH = image.naturalHeight;

  if (input === "photo") {
    const scale = Math.min(maxW / naturalW, maxH / naturalH);
    const drawW = naturalW * scale;
    const drawH = naturalH * scale;
    ctx.drawImage(image, footX - drawW / 2, footY - drawH, drawW, drawH);
    return canvas;
  }

  const bounds = trimmedBounds(image, naturalW, naturalH);
  const scale = Math.min(maxW / bounds.w, maxH / bounds.h);
  const drawW = bounds.w * scale;
  const drawH = bounds.h * scale;
  const drawX = footX - drawW / 2;
  const drawY = footY - drawH;

  // Stamp a tinted copy in a ring to build the outline in the image's silhouette.
  const border = document.createElement("canvas");
  border.width = canvas.width;
  border.height = canvas.height;
  const borderCtx = border.getContext("2d");
  if (borderCtx) {
    borderCtx.scale(ART_SCALE, ART_SCALE);
    const radius = 4;
    for (let i = 0; i < 24; i += 1) {
      const angle = (i / 24) * Math.PI * 2;
      borderCtx.drawImage(image, bounds.x, bounds.y, bounds.w, bounds.h, drawX + Math.cos(angle) * radius, drawY + Math.sin(angle) * radius, drawW, drawH);
    }
    borderCtx.globalCompositeOperation = "source-in";
    borderCtx.fillStyle = PALETTE.white;
    borderCtx.fillRect(0, 0, width, height);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.shadowColor = `rgba(${PALETTE.shadow}, 0.5)`;
    ctx.shadowBlur = 3 * ART_SCALE;
    ctx.drawImage(border, 0, 0);
    ctx.restore();
  }
  ctx.drawImage(image, bounds.x, bounds.y, bounds.w, bounds.h, drawX, drawY, drawW, drawH);
  return canvas;
}
