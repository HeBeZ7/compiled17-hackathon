/**
 * Single source for classroom geometry, in meters. x is left to right when
 * facing the board, z grows toward the back of the room, y is up. Authored
 * meshes, colliders and interaction checks must all read from here.
 */

export interface Box {
  x: number;
  z: number;
  /** Full width along x and depth along z. */
  w: number;
  d: number;
}

export interface Circle {
  x: number;
  z: number;
  r: number;
}

export const ROOM = { minX: -5.5, maxX: 5.5, minZ: -6.5, maxZ: 6.5, height: 4.2 } as const;

export const PLAYER = { eyeHeight: 1.32, radius: 0.28, walkSpeed: 2.4 } as const;

export const SPAWN = { x: 0, z: 5.2, yaw: 0 } as const;

export const TEACHER_DESK: Box = { x: 0.5, z: -3.9, w: 3.2, d: 0.95 };
export const TEACHER: Circle = { x: -1.75, z: -3.7, r: 0.42 };

export const LEARNING_DESK: Box = { x: 4.85, z: -1.4, w: 1.1, d: 2.6 };
export const LEARNING_CHAIR: Circle = { x: 3.95, z: -1.4, r: 0.36 };

export const STUDENT_DESKS: readonly Box[] = [
  { x: -2.9, z: 3.5, w: 1.7, d: 1.0 },
  { x: 2.9, z: 3.5, w: 1.7, d: 1.0 },
  { x: -2.9, z: 0.5, w: 1.7, d: 1.0 },
  { x: 2.9, z: 0.5, w: 1.7, d: 1.0 },
];

export const STUDENT_CHAIRS: readonly Circle[] = STUDENT_DESKS.map((d) => ({ x: d.x, z: d.z + 0.95, r: 0.36 }));

export const BOOKSHELF: Box = { x: -5.1, z: -1.2, w: 0.8, d: 5.0 };

export const PLANTERS: readonly Circle[] = [
  { x: 3.6, z: -5.7, r: 0.42 },
  { x: -4.9, z: 3.9, r: 0.4 },
];

export const BOX_COLLIDERS: readonly Box[] = [TEACHER_DESK, LEARNING_DESK, ...STUDENT_DESKS, BOOKSHELF];
export const CIRCLE_COLLIDERS: readonly Circle[] = [TEACHER, LEARNING_CHAIR, ...STUDENT_CHAIRS, ...PLANTERS];

export type InteractionId = "teacher" | "study_spot";

/** Reach is horizontal distance, aim is the maximum angle off the view direction, in radians. */
export const INTERACTIONS: Record<InteractionId, { x: number; z: number; reach: number; aim: number }> = {
  teacher: { x: TEACHER.x, z: TEACHER.z, reach: 2.4, aim: 0.5 },
  study_spot: { x: LEARNING_DESK.x, z: LEARNING_DESK.z, reach: 2.2, aim: 0.6 },
};
