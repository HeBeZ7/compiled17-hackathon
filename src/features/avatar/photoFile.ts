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
  if (file.size === 0) return "비어 있는 파일입니다. 다른 사진을 골라 주세요.";
  if (file.size > AVATAR_MAX_ORIGINAL_BYTES) {
    return `사진은 ${Math.floor(AVATAR_MAX_ORIGINAL_BYTES / 1024 / 1024)}MB 이하만 넣을 수 있습니다.`;
  }
  if (!sniffImageType(header)) return "PNG, JPEG, WebP 사진만 넣을 수 있습니다.";
  return null;
}

export function describePhotoSizeProblem(width: number, height: number): string | null {
  if (Math.min(width, height) < MIN_PHOTO_SIDE) return `사진이 너무 작습니다. 가로세로 ${MIN_PHOTO_SIDE}픽셀 이상이어야 합니다.`;
  if (Math.max(width, height) > MAX_PHOTO_SIDE) return `사진이 너무 큽니다. 긴 변이 ${MAX_PHOTO_SIDE}픽셀 이하여야 합니다.`;
  return null;
}
