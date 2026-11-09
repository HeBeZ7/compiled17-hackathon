"use client";

// TEMPORARY blockout. The shared world is a slice that models the room shell, the
// teacher desk and the teacher only, but layout.ts also has solid colliders for student
// desks, chairs, the learning desk, the bookshelf and planters. These stand in so
// the player never walks into invisible furniture. Remove when the world models them.

import {
  BOX_COLLIDERS,
  CIRCLE_COLLIDERS,
  TEACHER,
  TEACHER_DESK,
} from "@/shared/world/layout";

/** Top of the temporary student desks, in meters. */
export const TEMPORARY_DESK_TOP_Y = 0.75;

const BOXES = BOX_COLLIDERS.filter((box) => box !== TEACHER_DESK);
const CIRCLES = CIRCLE_COLLIDERS.filter((circle) => circle !== TEACHER);

export function TemporaryFurniture() {
  return (
    <group userData={{ notWorld: true }}>
      {BOXES.map((box) => (
        <mesh key={`${box.x}:${box.z}`} position={[box.x, TEMPORARY_DESK_TOP_Y / 2, box.z]}>
          <boxGeometry args={[box.w, TEMPORARY_DESK_TOP_Y, box.d]} />
          <meshBasicMaterial color="#e6efe8" toneMapped={false} />
        </mesh>
      ))}
      {CIRCLES.map((circle) => (
        <mesh key={`${circle.x}:${circle.z}`} position={[circle.x, TEMPORARY_DESK_TOP_Y / 2, circle.z]}>
          <cylinderGeometry args={[circle.r, circle.r, TEMPORARY_DESK_TOP_Y, 24]} />
          <meshBasicMaterial color="#ded7ec" toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}
