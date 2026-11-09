"use client";

// TEMPORARY development blockout: used only until @/shared/world/ClassroomWorld exists.

import { BOX_COLLIDERS, CIRCLE_COLLIDERS, ROOM } from "@/shared/world/layout";
import type { GraphicsQuality } from "@/shared/world/quality";

const WALL_THICKNESS = 0.2;
const PROP_HEIGHT = 0.75;

export function ClassroomWorld({ quality }: { quality: GraphicsQuality }) {
  const roomWidth = ROOM.maxX - ROOM.minX;
  const roomDepth = ROOM.maxZ - ROOM.minZ;
  const shadows = quality !== "low";
  return (
    <group>
      <hemisphereLight args={["#ffffff", "#d8e2d8", 1.4]} />
      <directionalLight position={[3, 6, 4]} intensity={1.6} castShadow={shadows} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[roomWidth, roomDepth]} />
        <meshStandardMaterial color="#efe3cf" />
      </mesh>
      {[
        { x: 0, z: ROOM.minZ - WALL_THICKNESS / 2, w: roomWidth, d: WALL_THICKNESS },
        { x: 0, z: ROOM.maxZ + WALL_THICKNESS / 2, w: roomWidth, d: WALL_THICKNESS },
        { x: ROOM.minX - WALL_THICKNESS / 2, z: 0, w: WALL_THICKNESS, d: roomDepth },
        { x: ROOM.maxX + WALL_THICKNESS / 2, z: 0, w: WALL_THICKNESS, d: roomDepth },
      ].map((wall) => (
        <mesh key={`${wall.x}:${wall.z}`} position={[wall.x, ROOM.height / 2, wall.z]}>
          <boxGeometry args={[wall.w, ROOM.height, wall.d]} />
          <meshStandardMaterial color="#e4f1fa" />
        </mesh>
      ))}
      {BOX_COLLIDERS.map((box) => (
        <mesh key={`${box.x}:${box.z}`} position={[box.x, PROP_HEIGHT / 2, box.z]} castShadow>
          <boxGeometry args={[box.w, PROP_HEIGHT, box.d]} />
          <meshStandardMaterial color="#bfe6d4" />
        </mesh>
      ))}
      {CIRCLE_COLLIDERS.map((circle) => (
        <mesh key={`${circle.x}:${circle.z}`} position={[circle.x, PROP_HEIGHT / 2, circle.z]} castShadow>
          <cylinderGeometry args={[circle.r, circle.r, PROP_HEIGHT, 20]} />
          <meshStandardMaterial color="#d9ccf2" />
        </mesh>
      ))}
    </group>
  );
}
