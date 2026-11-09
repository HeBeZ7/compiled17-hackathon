// Pure movement and collision. No Phaser or DOM here so it can be tested directly.

export type Vec2 = { x: number; y: number };

/** Axis-aligned box in world pixels: x/y is the top-left corner. */
export type Box = { x: number; y: number; w: number; h: number };

export type Facing = "down" | "up" | "left" | "right";

export type ActorState = {
  x: number;
  y: number;
  facing: Facing;
  moving: boolean;
};

/** Half-size of the actor's footprint, centred on (x, y) at the feet. */
export type Footprint = { halfW: number; halfH: number };

export type MoveWorld = {
  /** The walkable floor. The footprint must stay fully inside it. */
  bounds: Box;
  obstacles: readonly Box[];
  footprint: Footprint;
  /** Pixels per second at full input. */
  speed: number;
};

const INPUT_DEADZONE = 0.12;

/**
 * Clamps input to the unit circle, so a diagonal is exactly as fast as a
 * straight line while analog input below full deflection stays proportional.
 */
export function normalizeInput(input: Vec2): Vec2 {
  const length = Math.hypot(input.x, input.y);
  if (!Number.isFinite(length) || length < INPUT_DEADZONE) return { x: 0, y: 0 };
  const scale = length > 1 ? 1 / length : 1;
  return { x: input.x * scale, y: input.y * scale };
}

/** Horizontal wins a tie so that diagonal walking does not flicker between poses. */
export function facingFromInput(input: Vec2, previous: Facing): Facing {
  if (input.x === 0 && input.y === 0) return previous;
  if (Math.abs(input.x) >= Math.abs(input.y)) return input.x < 0 ? "left" : "right";
  return input.y < 0 ? "up" : "down";
}

function footBox(x: number, y: number, foot: Footprint): Box {
  return { x: x - foot.halfW, y: y - foot.halfH, w: foot.halfW * 2, h: foot.halfH * 2 };
}

// Being flush against a surface must never count as touching it, even after
// floating-point drift; otherwise sliding along a wall would snap the actor.
const CONTACT_EPSILON = 1e-6;

function overlaps(a: Box, b: Box): boolean {
  return (
    a.x < b.x + b.w - CONTACT_EPSILON &&
    a.x + a.w > b.x + CONTACT_EPSILON &&
    a.y < b.y + b.h - CONTACT_EPSILON &&
    a.y + a.h > b.y + CONTACT_EPSILON
  );
}

function moveAxis(
  axis: "x" | "y",
  from: { x: number; y: number },
  delta: number,
  world: MoveWorld,
): number {
  if (delta === 0) return from[axis];
  const { bounds, obstacles, footprint } = world;
  const half = axis === "x" ? footprint.halfW : footprint.halfH;
  const min = (axis === "x" ? bounds.x : bounds.y) + half;
  const max = (axis === "x" ? bounds.x + bounds.w : bounds.y + bounds.h) - half;
  let next = Math.min(max, Math.max(min, from[axis] + delta));

  for (const obstacle of obstacles) {
    const probe =
      axis === "x"
        ? footBox(next, from.y, footprint)
        : footBox(from.x, next, footprint);
    if (!overlaps(probe, obstacle)) continue;
    const near = axis === "x" ? obstacle.x : obstacle.y;
    const far = near + (axis === "x" ? obstacle.w : obstacle.h);
    // Stop flush against the side we approached from.
    next = delta > 0 ? near - half : far + half;
  }
  return next;
}

/**
 * Advances the actor by one frame. Axes resolve separately so walking into a
 * desk at an angle slides along it instead of stopping dead. Long frames are
 * split into sub-steps so a stall can never tunnel through a thin obstacle.
 */
export function stepActor(
  actor: ActorState,
  rawInput: Vec2,
  dtSeconds: number,
  world: MoveWorld,
): ActorState {
  const input = normalizeInput(rawInput);
  const wantsToMove = input.x !== 0 || input.y !== 0;
  const facing = facingFromInput(input, actor.facing);
  if (!wantsToMove || !(dtSeconds > 0)) {
    return { x: actor.x, y: actor.y, facing, moving: false };
  }

  const maxStep = Math.min(world.footprint.halfW, world.footprint.halfH);
  const distance = world.speed * Math.min(dtSeconds, 0.25);
  const steps = Math.max(1, Math.ceil(distance / maxStep));
  const stepDistance = distance / steps;

  let x = actor.x;
  let y = actor.y;
  for (let i = 0; i < steps; i += 1) {
    x = moveAxis("x", { x, y }, input.x * stepDistance, world);
    y = moveAxis("y", { x, y }, input.y * stepDistance, world);
  }
  return { x, y, facing, moving: x !== actor.x || y !== actor.y };
}

/** Distance from a point to the nearest point of a box; 0 when inside. */
export function distanceToBox(point: Vec2, box: Box): number {
  const dx = Math.max(box.x - point.x, 0, point.x - (box.x + box.w));
  const dy = Math.max(box.y - point.y, 0, point.y - (box.y + box.h));
  return Math.hypot(dx, dy);
}

/** The closest spot to `point` the actor can stand on, or null if none is near. */
export function nearestFree(point: Vec2, world: MoveWorld): Vec2 | null {
  const { bounds, footprint } = world;
  const clamped = {
    x: Math.min(bounds.x + bounds.w - footprint.halfW, Math.max(bounds.x + footprint.halfW, point.x)),
    y: Math.min(bounds.y + bounds.h - footprint.halfH, Math.max(bounds.y + footprint.halfH, point.y)),
  };
  if (isFree(clamped, world)) return clamped;
  const step = 4;
  for (let radius = step; radius <= 400; radius += step) {
    for (let angle = 0; angle < 16; angle += 1) {
      const theta = (angle / 16) * Math.PI * 2;
      const candidate = {
        x: clamped.x + Math.cos(theta) * radius,
        y: clamped.y + Math.sin(theta) * radius,
      };
      if (isFree(candidate, world)) return candidate;
    }
  }
  return null;
}

/** True when an actor can occupy this spot without touching anything. */
export function isFree(point: Vec2, world: MoveWorld): boolean {
  const box = footBox(point.x, point.y, world.footprint);
  const { bounds } = world;
  const inside =
    box.x >= bounds.x &&
    box.y >= bounds.y &&
    box.x + box.w <= bounds.x + bounds.w &&
    box.y + box.h <= bounds.y + bounds.h;
  return inside && !world.obstacles.some((obstacle) => overlaps(box, obstacle));
}
