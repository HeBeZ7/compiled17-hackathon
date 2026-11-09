"use client";

import { useEffect, useState } from "react";
import { SRGBColorSpace, TextureLoader, type Texture } from "three";
import { STUDENT_DESKS } from "@/shared/world/layout";
import { TEMPORARY_DESK_TOP_Y } from "./TemporaryFurniture";

export type AvatarFrameStatus = "none" | "loading" | "loaded" | "failed";

// Meters. layout.ts has no desk height.
const DESK_TOP_Y = TEMPORARY_DESK_TOP_Y;
const PICTURE_MAX_WIDTH = 0.26;
const PICTURE_MAX_HEIGHT = 0.32;
const BORDER = 0.022;
const FRAME_DEPTH = 0.02;
const TILT_BACK = -0.14;
// Turns the picture toward the aisle so it can be seen on the way past the desk.
const TURN_TO_AISLE = 0.7;

interface LoadedPicture {
  url: string;
  texture: Texture;
  aspect: number;
}

/**
 * An explicit picture of the user's avatar on the student desk: a flat framed
 * image, not a reconstruction of the user as a 3D character.
 */
export function AvatarFrame({
  url,
  onStatus,
}: {
  url: string;
  onStatus: (url: string, status: "loaded" | "failed") => void;
}) {
  const [picture, setPicture] = useState<LoadedPicture | null>(null);

  useEffect(() => {
    let cancelled = false;
    let owned: Texture | null = null;
    new TextureLoader().load(
      url,
      (texture) => {
        if (cancelled) {
          texture.dispose();
          return;
        }
        owned = texture;
        texture.colorSpace = SRGBColorSpace;
        const image = texture.image as { width: number; height: number };
        setPicture({ url, texture, aspect: image.width / image.height });
        onStatus(url, "loaded");
      },
      undefined,
      () => {
        if (!cancelled) onStatus(url, "failed");
      },
    );
    return () => {
      cancelled = true;
      owned?.dispose();
    };
  }, [url, onStatus]);

  if (!picture || picture.url !== url) return null;

  // Fit the whole image inside the frame so nothing is cropped.
  const scale = Math.min(PICTURE_MAX_WIDTH / picture.aspect, PICTURE_MAX_HEIGHT);
  const height = scale;
  const width = scale * picture.aspect;
  const outerW = width + BORDER * 2;
  const outerH = height + BORDER * 2;

  const desk = STUDENT_DESKS[0];
  const position: [number, number, number] = [desk.x + desk.w / 2 - 0.3, DESK_TOP_Y + outerH / 2, desk.z - 0.12];

  return (
    <group position={position} rotation={[0, TURN_TO_AISLE, 0]} name="avatar-picture-frame" userData={{ notWorld: true }}>
      <group rotation={[TILT_BACK, 0, 0]}>
        <mesh>
          <boxGeometry args={[outerW, outerH, FRAME_DEPTH]} />
          <meshBasicMaterial color="#f2e4ce" toneMapped={false} />
        </mesh>
        <mesh position={[0, 0, FRAME_DEPTH / 2 + 0.0005]}>
          <planeGeometry args={[width, height]} />
          <meshBasicMaterial color="#fbf9f4" toneMapped={false} />
        </mesh>
        {/* Unlit so the room's lighting never darkens or tints the user's own picture. */}
        <mesh position={[0, 0, FRAME_DEPTH / 2 + 0.001]}>
          <planeGeometry args={[width, height]} />
          <meshBasicMaterial map={picture.texture} transparent toneMapped={false} />
        </mesh>
      </group>
      <mesh position={[0, -0.01, -0.05]} rotation={[0.5, 0, 0]}>
        <boxGeometry args={[outerW * 0.3, outerH * 0.9, 0.008]} />
        <meshBasicMaterial color="#f2e4ce" toneMapped={false} />
      </mesh>
    </group>
  );
}
