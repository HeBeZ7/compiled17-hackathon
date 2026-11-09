import { color } from "@/shared/ui";
import { alphaBounds, cropRect, fitBottomCenter, type PhotoCrop, type Rect, type Size } from "./geometry";

/**
 * Game render: square transparent PNG, character standing on the bottom edge,
 * centered, with a white sticker outline that keeps it readable on any floor.
 */
export const AVATAR_RENDER_SIZE = 256;

const OUTLINE = 6;
const PADDING = OUTLINE + 2;
const OUTLINE_STAMPS = 24;

function makeCanvas(size: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  return canvas;
}

function context(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas 2D is unavailable");
  ctx.imageSmoothingQuality = "high";
  return ctx;
}

export function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("PNG encoding failed"))), "image/png");
  });
}

function withStickerOutline(art: HTMLCanvasElement): HTMLCanvasElement {
  const silhouette = makeCanvas(art.width);
  const silhouetteCtx = context(silhouette);
  silhouetteCtx.drawImage(art, 0, 0);
  silhouetteCtx.globalCompositeOperation = "source-in";
  silhouetteCtx.fillStyle = color.surface;
  silhouetteCtx.fillRect(0, 0, art.width, art.height);

  const result = makeCanvas(art.width);
  const ctx = context(result);
  for (let i = 0; i < OUTLINE_STAMPS; i++) {
    const angle = (i / OUTLINE_STAMPS) * Math.PI * 2;
    ctx.drawImage(silhouette, Math.cos(angle) * OUTLINE, Math.sin(angle) * OUTLINE);
  }
  ctx.drawImage(art, 0, 0);
  return result;
}

/** Trims empty space around the drawing. Returns null when nothing is painted. */
export async function renderDrawing(source: HTMLCanvasElement): Promise<Blob | null> {
  const { data } = context(source).getImageData(0, 0, source.width, source.height);
  const bounds = alphaBounds(data, source.width, source.height);
  if (!bounds) return null;

  const art = makeCanvas(AVATAR_RENDER_SIZE);
  const target = fitBottomCenter(bounds, AVATAR_RENDER_SIZE, PADDING);
  context(art).drawImage(
    source,
    bounds.x,
    bounds.y,
    bounds.width,
    bounds.height,
    target.x,
    target.y,
    target.width,
    target.height,
  );
  return canvasToPng(withStickerOutline(art));
}

/** The photo itself in a round sticker. No background removal or stylizing. */
export function renderPhoto(bitmap: ImageBitmap, crop: PhotoCrop): Promise<Blob> {
  const art = makeCanvas(AVATAR_RENDER_SIZE);
  const ctx = context(art);
  const inner = AVATAR_RENDER_SIZE - PADDING * 2;
  ctx.beginPath();
  ctx.arc(AVATAR_RENDER_SIZE / 2, AVATAR_RENDER_SIZE / 2, inner / 2, 0, Math.PI * 2);
  ctx.clip();
  const from: Rect = cropRect(bitmap as Size, crop);
  ctx.drawImage(bitmap, from.x, from.y, from.width, from.height, PADDING, PADDING, inner, inner);
  return canvasToPng(withStickerOutline(art));
}

/** The cropping view: the square crop with everything outside the sticker circle dimmed. */
export function paintCropView(view: HTMLCanvasElement, bitmap: ImageBitmap, crop: PhotoCrop): void {
  const ctx = context(view);
  const size = view.width;
  const from = cropRect(bitmap as Size, crop);
  ctx.clearRect(0, 0, size, size);
  ctx.drawImage(bitmap, from.x, from.y, from.width, from.height, 0, 0, size, size);

  ctx.beginPath();
  ctx.rect(0, 0, size, size);
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255, 255, 255, 0.72)";
  ctx.fill("evenodd");
}

/** Throws if the URL cannot be fetched or the bytes are not a decodable image. */
export async function loadBitmap(source: Blob | string, signal?: AbortSignal): Promise<ImageBitmap> {
  if (typeof source !== "string") return createImageBitmap(source);
  return createImageBitmap(await fetchImage(source, signal));
}

export async function fetchImage(url: string, signal?: AbortSignal): Promise<Blob> {
  const response = await fetch(url, { credentials: "same-origin", signal });
  if (!response.ok) throw new Error(`Image request failed: ${response.status}`);
  return response.blob();
}
