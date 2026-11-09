import { describe, expect, it } from "vitest";
import type { AvatarAsset } from "@/shared/contracts";
import { selectAvatar, type AvatarDraft, type EditorStates } from "./avatarDraft";
import { alphaBounds, clampCrop, cropRect, fitBottomCenter, initialCrop, panCrop } from "./geometry";
import { describePhotoProblem, describePhotoSizeProblem, sniffImageType } from "./photoFile";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0]);
const WEBP = new TextEncoder().encode("RIFF\0\0\0\0WEBP");

describe("photo file checks", () => {
  it("identifies images by their bytes and rejects anything else", () => {
    expect(sniffImageType(PNG)).toBe("image/png");
    expect(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffImageType(WEBP)).toBe("image/webp");
    expect(sniffImageType(new TextEncoder().encode("<svg xmlns="))).toBeNull();
  });

  it("names the problem for empty, oversized and non-image files", () => {
    expect(describePhotoProblem({ size: 0 }, PNG)).toContain("empty");
    expect(describePhotoProblem({ size: 8 * 1024 * 1024 + 1 }, PNG)).toContain("8MB");
    expect(describePhotoProblem({ size: 100 }, new Uint8Array(12))).toContain("PNG");
    expect(describePhotoProblem({ size: 8 * 1024 * 1024 }, PNG)).toBeNull();
  });

  it("rejects decoded sizes outside the supported range", () => {
    expect(describePhotoSizeProblem(10, 500)).toContain("too small");
    expect(describePhotoSizeProblem(20_000, 500)).toContain("too large");
    expect(describePhotoSizeProblem(800, 600)).toBeNull();
  });
});

describe("alphaBounds", () => {
  const image = (width: number, height: number, painted: [number, number][]) => {
    const rgba = new Uint8ClampedArray(width * height * 4);
    for (const [x, y] of painted) rgba[(y * width + x) * 4 + 3] = 255;
    return rgba;
  };

  it("is null for a blank canvas, so an erased drawing cannot be saved", () => {
    expect(alphaBounds(image(8, 8, []), 8, 8)).toBeNull();
  });

  it("encloses the painted pixels", () => {
    expect(alphaBounds(image(10, 8, [[2, 3], [6, 5]]), 10, 8)).toEqual({ x: 2, y: 3, width: 5, height: 3 });
  });
});

describe("fitBottomCenter", () => {
  it("keeps proportions and stands the art on the bottom padding", () => {
    expect(fitBottomCenter({ width: 100, height: 200 }, 256, 8)).toEqual({ x: 68, y: 8, width: 120, height: 240 });
    const wide = fitBottomCenter({ width: 200, height: 100 }, 256, 8);
    expect(wide.y + wide.height).toBe(248);
    expect(wide.x).toBe(8);
  });
});

describe("photo crop", () => {
  const photo = { width: 1000, height: 500 };

  it("starts as the largest centered square", () => {
    expect(cropRect(photo, initialCrop(photo))).toEqual({ x: 250, y: 0, width: 500, height: 500 });
  });

  it("never leaves the photo when dragged past its edge", () => {
    const moved = panCrop(photo, initialCrop(photo), 100_000, 100_000, 400);
    expect(cropRect(photo, moved)).toEqual({ x: 0, y: 0, width: 500, height: 500 });
  });

  it("moves the photo with the pointer at the view's scale", () => {
    const moved = panCrop(photo, initialCrop(photo), -40, 0, 400);
    expect(moved.centerX).toBe(550);
  });

  it("re-centers a crop that zooming out would push outside", () => {
    const zoomedIn = { zoom: 4, centerX: 62.5, centerY: 62.5 };
    expect(clampCrop(photo, { ...zoomedIn, zoom: 1 })).toEqual({ zoom: 1, centerX: 250, centerY: 250 });
  });
});

describe("selectAvatar", () => {
  const saved: AvatarAsset = {
    assetId: "6f1e4f1c-4f9b-4c6e-9d3a-0a4d1b7c2e10",
    inputKind: "photo",
    originalUrl: "/o",
    renderUrl: "/r",
    createdAt: "2026-11-09T00:00:00.000Z",
  };
  const draft = { inputKind: "drawing" } as AvatarDraft;
  const states = (drawing: EditorStates["drawing"], photo: EditorStates["photo"]): EditorStates => ({ drawing, photo });
  const pristine = { status: "pristine" } as const;

  it("keeps the saved appearance only for its own input kind", () => {
    expect(selectAvatar("photo", states(pristine, pristine), saved)).toEqual({ status: "saved", avatar: saved });
    expect(selectAvatar("drawing", states(pristine, pristine), saved)).toEqual({ status: "none" });
  });

  it("prefers the new work, and never falls back to the saved one after it was removed", () => {
    expect(selectAvatar("drawing", states({ status: "ready", draft }, pristine), saved)).toEqual({ status: "draft", draft });
    expect(selectAvatar("photo", states(pristine, { status: "empty" }), saved)).toEqual({ status: "none" });
  });

  it("reports pending so a save cannot upload the previous render", () => {
    expect(selectAvatar("photo", states(pristine, { status: "pending" }), saved)).toEqual({ status: "pending" });
  });
});
