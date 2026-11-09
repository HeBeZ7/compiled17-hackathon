// Pure first-person movement, collision and targeting. No DOM or renderer here
// so it can be tested directly. Yaw 0 faces -z (the board), matching three.js.

import type { Box, Circle } from "@/shared/world/layout";

export interface Vec2 {
  x: number;
  z: number;
}

/** Forward is along the view direction, strafe is to the player's right. */
export interface MoveIntent {
  forward: number;
  strafe: number;
}

export interface CollisionWorld {
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  boxes: readonly Box[];
  circles: readonly Circle[];
  /** Player radius in meters. */
  radius: number;
  /** Meters per second at full input. */
  speed: number;
}

/** Frames longer than this are shortened: a stall must not teleport the player, but a slow device still walks at full speed. */
export const MAX_FRAME_SECONDS = 0.5;
export const MAX_PITCH = 1.35;

const INPUT_DEADZONE = 0.12;
const CONTACT_EPSILON = 1e-6;
const RESOLVE_PASSES = 4;

export function clampPitch(pitch: number): number {
  return Math.min(MAX_PITCH, Math.max(-MAX_PITCH, pitch));
}

/** Keeps yaw within (-PI, PI] however far the player has turned. */
export function wrapYaw(yaw: number): number {
  const wrapped = yaw % (2 * Math.PI);
  if (wrapped > Math.PI) return wrapped - 2 * Math.PI;
  if (wrapped <= -Math.PI) return wrapped + 2 * Math.PI;
  return wrapped;
}

/**
 * Clamps intent to the unit circle, so a diagonal is exactly as fast as a
 * straight line while a partly deflected stick stays proportional.
 */
export function normalizeIntent(intent: MoveIntent): MoveIntent {
  const length = Math.hypot(intent.forward, intent.strafe);
  if (!Number.isFinite(length) || length < INPUT_DEADZONE) return { forward: 0, strafe: 0 };
  const scale = length > 1 ? 1 / length : 1;
  return { forward: intent.forward * scale, strafe: intent.strafe * scale };
}

/** Horizontal world direction for an intent at a given yaw. */
export function worldDirection(intent: MoveIntent, yaw: number): Vec2 {
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  return {
    x: -sin * intent.forward + cos * intent.strafe,
    z: -cos * intent.forward - sin * intent.strafe,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function boxPush(x: number, z: number, box: Box, radius: number): Vec2 | null {
  const minX = box.x - box.w / 2;
  const maxX = box.x + box.w / 2;
  const minZ = box.z - box.d / 2;
  const maxZ = box.z + box.d / 2;
  const nearX = clamp(x, minX, maxX);
  const nearZ = clamp(z, minZ, maxZ);
  const dx = x - nearX;
  const dz = z - nearZ;
  const distance = Math.hypot(dx, dz);
  if (distance >= radius - CONTACT_EPSILON) return null;
  if (distance > CONTACT_EPSILON) {
    return { x: nearX + (dx / distance) * radius, z: nearZ + (dz / distance) * radius };
  }
  // Center is inside the box: leave through the closest face.
  const exits = [
    { d: x - minX, x: minX - radius, z },
    { d: maxX - x, x: maxX + radius, z },
    { d: z - minZ, x, z: minZ - radius },
    { d: maxZ - z, x, z: maxZ + radius },
  ];
  exits.sort((a, b) => a.d - b.d);
  return { x: exits[0].x, z: exits[0].z };
}

function circlePush(x: number, z: number, circle: Circle, radius: number): Vec2 | null {
  const min = circle.r + radius;
  const dx = x - circle.x;
  const dz = z - circle.z;
  const distance = Math.hypot(dx, dz);
  if (distance >= min - CONTACT_EPSILON) return null;
  if (distance > CONTACT_EPSILON) {
    return { x: circle.x + (dx / distance) * min, z: circle.z + (dz / distance) * min };
  }
  return { x: circle.x, z: circle.z + min };
}

/**
 * Pushes a point out of every collider and back inside the room. Pushing along
 * the contact normal keeps the motion tangent to the surface, which is sliding.
 */
export function resolveCollisions(point: Vec2, world: CollisionWorld): Vec2 {
  let { x, z } = point;
  const { bounds, boxes, circles, radius } = world;
  for (let pass = 0; pass < RESOLVE_PASSES; pass += 1) {
    let pushed = false;
    for (const box of boxes) {
      const out = boxPush(x, z, box, radius);
      if (out) {
        x = out.x;
        z = out.z;
        pushed = true;
      }
    }
    for (const circle of circles) {
      const out = circlePush(x, z, circle, radius);
      if (out) {
        x = out.x;
        z = out.z;
        pushed = true;
      }
    }
    const clampedX = clamp(x, bounds.minX + radius, bounds.maxX - radius);
    const clampedZ = clamp(z, bounds.minZ + radius, bounds.maxZ - radius);
    if (clampedX !== x || clampedZ !== z) {
      x = clampedX;
      z = clampedZ;
      pushed = true;
    }
    if (!pushed) break;
  }
  return { x, z };
}

/** True when the player can stand here without touching anything. */
export function isFree(point: Vec2, world: CollisionWorld): boolean {
  const { bounds, boxes, circles, radius } = world;
  if (
    point.x < bounds.minX + radius - CONTACT_EPSILON ||
    point.x > bounds.maxX - radius + CONTACT_EPSILON ||
    point.z < bounds.minZ + radius - CONTACT_EPSILON ||
    point.z > bounds.maxZ - radius + CONTACT_EPSILON
  ) {
    return false;
  }
  return (
    boxes.every((box) => boxPush(point.x, point.z, box, radius) === null) &&
    circles.every((circle) => circlePush(point.x, point.z, circle, radius) === null)
  );
}

export interface StepResult extends Vec2 {
  moving: boolean;
}

/**
 * Advances the player one frame. Distance depends only on elapsed time, and the
 * frame is split into steps shorter than the player's radius so that no frame
 * length can carry the player through a collider.
 */
export function stepPlayer(
  from: Vec2,
  rawIntent: MoveIntent,
  yaw: number,
  dtSeconds: number,
  world: CollisionWorld,
): StepResult {
  const intent = normalizeIntent(rawIntent);
  if ((intent.forward === 0 && intent.strafe === 0) || !(dtSeconds > 0)) {
    return { x: from.x, z: from.z, moving: false };
  }

  const direction = worldDirection(intent, yaw);
  const distance = world.speed * Math.min(dtSeconds, MAX_FRAME_SECONDS);
  const steps = Math.max(1, Math.ceil((distance * Math.hypot(direction.x, direction.z)) / (world.radius * 0.5)));
  const stepX = (direction.x * distance) / steps;
  const stepZ = (direction.z * distance) / steps;

  let current: Vec2 = { x: from.x, z: from.z };
  for (let i = 0; i < steps; i += 1) {
    const next = resolveCollisions({ x: current.x + stepX, z: current.z + stepZ }, world);
    // A pinch between colliders cannot be resolved: hold the last valid spot.
    if (isFree(next, world)) current = next;
  }
  const moving = Math.hypot(current.x - from.x, current.z - from.z) > CONTACT_EPSILON;
  return { x: current.x, z: current.z, moving };
}

export interface AimTarget {
  x: number;
  z: number;
  reach: number;
  aim: number;
}

/**
 * Angle between the 3D view direction and the direction to a target, treating
 * the target as level with the player's eyes.
 */
export function aimAngle(from: Vec2, yaw: number, pitch: number, target: Vec2): number {
  const dx = target.x - from.x;
  const dz = target.z - from.z;
  const distance = Math.hypot(dx, dz);
  if (distance < CONTACT_EPSILON) return 0;
  const cosPitch = Math.cos(pitch);
  const dot = (-Math.sin(yaw) * cosPitch * dx - Math.cos(yaw) * cosPitch * dz) / distance;
  return Math.acos(clamp(dot, -1, 1));
}

/** The in-reach target closest to the center of view, or null if none is aimed at. */
export function pickTarget<Id extends string>(
  from: Vec2,
  yaw: number,
  pitch: number,
  targets: Readonly<Record<Id, AimTarget>>,
): Id | null {
  let best: Id | null = null;
  let bestAngle = Infinity;
  for (const id of Object.keys(targets) as Id[]) {
    const target = targets[id];
    if (Math.hypot(target.x - from.x, target.z - from.z) > target.reach) continue;
    const angle = aimAngle(from, yaw, pitch, target);
    if (angle <= target.aim && angle < bestAngle) {
      best = id;
      bestAngle = angle;
    }
  }
  return best;
}

/** Keeps a wide enough view on narrow screens, where a fixed vertical FOV feels like tunnel vision. */
export function verticalFovForAspect(aspect: number, baseVerticalDeg = 62, minHorizontalDeg = 72, maxVerticalDeg = 92): number {
  const halfHorizontal = (minHorizontalDeg * Math.PI) / 360;
  const needed = (2 * Math.atan(Math.tan(halfHorizontal) / aspect) * 180) / Math.PI;
  return Math.min(maxVerticalDeg, Math.max(baseVerticalDeg, needed));
}
