import { AVATAR_MAX_ORIGINAL_BYTES, type AVATAR_MIME_TYPES } from "@/shared/contracts";

export type AvatarMimeType = (typeof AVATAR_MIME_TYPES)[number];

/** Bytes needed by sniffImageType. */
export const SNIFF_BYTES = 12;

export const MIN_PHOTO_SIDE = 32;
export const MAX_PHOTO_SIDE = 12_000;

/** Same magic-byte rules as the server, so a bad file fails before the upload. */
export function sniffImageType(bytes: Uint8Array): AvatarMimeType | null {
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
  if (bytes[0] === 0x89 && ascii(1, 4) === "PNG") return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  return null;
}

/** Returns what is wrong with the file, or null when it is worth decoding. */
export function describePhotoProblem(file: { size: number }, header: Uint8Array): string | null {
  if (file.size === 0) return "This file is empty  Please pick another photo";
  if (file.size > AVATAR_MAX_ORIGINAL_BYTES) {
    return `Photos must be ${Math.floor(AVATAR_MAX_ORIGINAL_BYTES / 1024 / 1024)}MB or smaller`;
  }
  if (!sniffImageType(header)) return "Only PNG, JPEG and WebP photos can be used";
  return null;
}

export function describePhotoSizeProblem(width: number, height: number): string | null {
  if (Math.min(width, height) < MIN_PHOTO_SIDE) return `This photo is too small  Each side must be at least ${MIN_PHOTO_SIDE} pixels`;
  if (Math.max(width, height) > MAX_PHOTO_SIDE) return `This photo is too large  The long side must be at most ${MAX_PHOTO_SIDE} pixels`;
  return null;
}
