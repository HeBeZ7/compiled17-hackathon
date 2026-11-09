export interface Size {
  width: number;
  height: number;
}

export interface Rect extends Size {
  x: number;
  y: number;
}

/** Smallest rectangle holding every pixel above the alpha threshold, or null if the image is empty. */
export function alphaBounds(rgba: ArrayLike<number>, width: number, height: number, threshold = 8): Rect | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (rgba[(y * width + x) * 4 + 3] <= threshold) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/** Places `art` inside a padded square, feet on the bottom edge, so characters share a ground line. */
export function fitBottomCenter(art: Size, box: number, padding: number): Rect {
  const inner = box - padding * 2;
  const scale = Math.min(inner / art.width, inner / art.height);
  const width = art.width * scale;
  const height = art.height * scale;
  return { x: (box - width) / 2, y: box - padding - height, width, height };
}

/** Square photo crop in source pixels. Zoom 1 is the largest square that fits. */
export interface PhotoCrop {
  zoom: number;
  centerX: number;
  centerY: number;
}

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;

function cropSide(image: Size, zoom: number): number {
  return Math.min(image.width, image.height) / zoom;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function initialCrop(image: Size): PhotoCrop {
  return { zoom: MIN_ZOOM, centerX: image.width / 2, centerY: image.height / 2 };
}

/** Keeps the crop square fully inside the photo. */
export function clampCrop(image: Size, crop: PhotoCrop): PhotoCrop {
  const zoom = clamp(crop.zoom, MIN_ZOOM, MAX_ZOOM);
  const half = cropSide(image, zoom) / 2;
  return {
    zoom,
    centerX: clamp(crop.centerX, half, image.width - half),
    centerY: clamp(crop.centerY, half, image.height - half),
  };
}

/** Moves the photo by a drag measured on a square view of `viewSize` pixels. */
export function panCrop(image: Size, crop: PhotoCrop, dragX: number, dragY: number, viewSize: number): PhotoCrop {
  const sourcePerViewPixel = cropSide(image, crop.zoom) / viewSize;
  return clampCrop(image, {
    ...crop,
    centerX: crop.centerX - dragX * sourcePerViewPixel,
    centerY: crop.centerY - dragY * sourcePerViewPixel,
  });
}

export function cropRect(image: Size, crop: PhotoCrop): Rect {
  const side = cropSide(image, crop.zoom);
  return { x: crop.centerX - side / 2, y: crop.centerY - side / 2, width: side, height: side };
}
