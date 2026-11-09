import { describe, expect, it } from "vitest";
import {
  BOX_COLLIDERS,
  CIRCLE_COLLIDERS,
  INTERACTIONS,
  PLAYER,
  ROOM,
  SPAWN,
  TEACHER,
  type Box,
} from "@/shared/world/layout";
import {
  MAX_FRAME_SECONDS,
  MAX_PITCH,
  aimAngle,
  clampPitch,
  isFree,
  normalizeIntent,
  pickTarget,
  stepPlayer,
  verticalFovForAspect,
  worldDirection,
  wrapYaw,
  type CollisionWorld,
  type MoveIntent,
  type Vec2,
} from "./movement";

const openRoom: CollisionWorld = {
  bounds: { minX: -10, maxX: 10, minZ: -10, maxZ: 10 },
  boxes: [],
  circles: [],
  radius: 0.3,
  speed: 2,
};

const roomWith = (boxes: readonly Box[]): CollisionWorld => ({ ...openRoom, boxes });

const realRoom: CollisionWorld = {
  bounds: ROOM,
  boxes: BOX_COLLIDERS,
  circles: CIRCLE_COLLIDERS,
  radius: PLAYER.radius,
  speed: PLAYER.walkSpeed,
};

const FORWARD: MoveIntent = { forward: 1, strafe: 0 };

function run(start: Vec2, intent: MoveIntent, yaw: number, frames: number, dt: number, world: CollisionWorld) {
  let position = start;
  for (let i = 0; i < frames; i += 1) position = stepPlayer(position, intent, yaw, dt, world);
  return position;
}

describe("direction", () => {
  it("faces the board at yaw 0, with strafe to the right", () => {
    expect(worldDirection(FORWARD, 0).x).toBeCloseTo(0);
    expect(worldDirection(FORWARD, 0).z).toBeCloseTo(-1);
    expect(worldDirection({ forward: 0, strafe: 1 }, 0).x).toBeCloseTo(1);
    expect(worldDirection({ forward: 0, strafe: 1 }, 0).z).toBeCloseTo(0);
  });

  it("turns left with positive yaw", () => {
    expect(worldDirection(FORWARD, Math.PI / 2).x).toBeCloseTo(-1);
    expect(worldDirection(FORWARD, Math.PI / 2).z).toBeCloseTo(0);
  });
});

describe("frame rate independence", () => {
  it.each([
    [30, 30],
    [60, 60],
    [144, 144],
    [7, 7],
  ])("covers the same distance per second at %i fps", (fps, frames) => {
    const end = run({ x: 0, z: 5 }, FORWARD, 0, frames, 1 / fps, openRoom);
    expect(5 - end.z).toBeCloseTo(openRoom.speed, 6);
    expect(end.x).toBeCloseTo(0, 9);
  });

  it("lands in nearly the same place when sliding along a wall at different frame rates", () => {
    const wall = roomWith([{ x: 0, z: 0, w: 20, d: 1 }]);
    const yaw = -Math.PI / 4;
    const start = { x: -3, z: 1.5 };
    const fast = run(start, FORWARD, yaw, 240, 1 / 120, wall);
    const slow = run(start, FORWARD, yaw, 40, 1 / 20, wall);
    expect(fast.x).toBeCloseTo(slow.x, 1);
    expect(fast.z).toBeCloseTo(slow.z, 3);
  });

  it("does not move on a zero or negative delta", () => {
    expect(stepPlayer({ x: 1, z: 1 }, FORWARD, 0, 0, openRoom)).toEqual({ x: 1, z: 1, moving: false });
    expect(stepPlayer({ x: 1, z: 1 }, FORWARD, 0, -1, openRoom)).toEqual({ x: 1, z: 1, moving: false });
  });

  it("clamps a huge delta instead of teleporting", () => {
    const end = stepPlayer({ x: 0, z: 9 }, FORWARD, 0, 30, openRoom);
    expect(9 - end.z).toBeCloseTo(openRoom.speed * MAX_FRAME_SECONDS, 6);
  });
});

describe("diagonal speed", () => {
  it("is the same as straight speed at any yaw", () => {
    for (const yaw of [0, 0.7, -2.1, 3]) {
      const end = stepPlayer({ x: 0, z: 0 }, { forward: 1, strafe: 1 }, yaw, 0.1, openRoom);
      expect(Math.hypot(end.x, end.z)).toBeCloseTo(openRoom.speed * 0.1, 8);
    }
  });

  it("keeps a part-way stick proportional and ignores a tiny one", () => {
    expect(normalizeIntent({ forward: 0.5, strafe: 0 })).toEqual({ forward: 0.5, strafe: 0 });
    expect(normalizeIntent({ forward: 0.05, strafe: 0.05 })).toEqual({ forward: 0, strafe: 0 });
  });

  it("ignores non-finite intent", () => {
    expect(normalizeIntent({ forward: Number.NaN, strafe: 1 })).toEqual({ forward: 0, strafe: 0 });
  });
});

describe("collision", () => {
  it("stops flush against a room wall and reports no movement", () => {
    const world: CollisionWorld = { ...openRoom, bounds: { minX: -1, maxX: 1, minZ: -1, maxZ: 1 } };
    const end = run({ x: 0, z: 0 }, FORWARD, 0, 60, 1 / 30, world);
    expect(end.z).toBeCloseTo(-1 + openRoom.radius, 6);
    expect(stepPlayer(end, FORWARD, 0, 1 / 30, world).moving).toBe(false);
  });

  it("slides along a wall when walking into it at an angle", () => {
    const wall = roomWith([{ x: 0, z: 0, w: 20, d: 1 }]);
    const start = { x: 0, z: 0.5 + wall.radius };
    const end = run(start, FORWARD, -Math.PI / 4, 30, 1 / 30, wall);
    expect(end.z).toBeCloseTo(start.z, 6);
    expect(end.x).toBeCloseTo(wall.speed * Math.SQRT1_2, 2);
  });

  it("slides along a real student desk without entering it", () => {
    const desk = BOX_COLLIDERS.find((box) => box.x === 2.9 && box.z === 3.5);
    if (!desk) throw new Error("expected a student desk at (2.9, 3.5)");
    const start = { x: desk.x - desk.w / 2 - PLAYER.radius, z: desk.z + 0.3 };
    const end = run(start, { forward: 1, strafe: 0 }, -Math.PI / 3, 12, 1 / 60, realRoom);
    expect(isFree(end, realRoom)).toBe(true);
    expect(end.z).toBeLessThan(start.z - 0.05);
  });

  it("rounds a box corner instead of stopping dead", () => {
    const pillar = roomWith([{ x: 0, z: 0, w: 1, d: 1 }]);
    const end = run({ x: 0.6, z: 1.2 }, FORWARD, 0, 60, 1 / 60, pillar);
    expect(end.z).toBeLessThan(0);
    expect(end.x).toBeGreaterThan(0.5);
  });

  it("slides around a circular collider", () => {
    const world: CollisionWorld = { ...openRoom, circles: [{ x: 0, z: 0, r: 0.4 }] };
    const end = run({ x: 0.2, z: 1.5 }, FORWARD, 0, 90, 1 / 60, world);
    expect(end.z).toBeLessThan(0);
    expect(isFree(end, world)).toBe(true);
  });

  it("cannot tunnel through a thin wall on the longest clamped frame", () => {
    const sheet = roomWith([{ x: 0, z: 0, w: 20, d: 0.02 }]);
    const fast: CollisionWorld = { ...sheet, speed: 30 };
    const end = stepPlayer({ x: 0, z: 1 }, FORWARD, 0, 10, fast);
    expect(end.z).toBeGreaterThanOrEqual(0.01 + fast.radius - 1e-6);
  });

  it("cannot tunnel at a very low frame rate over many frames", () => {
    const sheet = roomWith([{ x: 0, z: 0, w: 20, d: 0.02 }]);
    expect(run({ x: 0, z: 2 }, FORWARD, 0, 30, 0.25, sheet).z).toBeGreaterThan(0);
  });

  it("holds position in a pinch too narrow to enter", () => {
    const gap = roomWith([
      { x: -0.75, z: 0, w: 1, d: 0.2 },
      { x: 0.75, z: 0, w: 1, d: 0.2 },
    ]);
    const end = run({ x: 0, z: 1 }, FORWARD, 0, 120, 1 / 60, gap);
    expect(isFree(end, gap)).toBe(true);
    expect(end.z).toBeGreaterThan(0);
  });

  it("stays free of every real collider on a long random walk", () => {
    let seed = 12345;
    const random = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    let position: Vec2 = { x: SPAWN.x, z: SPAWN.z };
    expect(isFree(position, realRoom)).toBe(true);
    for (let i = 0; i < 400; i += 1) {
      const yaw = random() * Math.PI * 2;
      const dt = 0.01 + random() * 0.24;
      for (let frame = 0; frame < 6; frame += 1) position = stepPlayer(position, FORWARD, yaw, dt, realRoom);
      expect(isFree(position, realRoom)).toBe(true);
    }
  });
});

describe("look", () => {
  it("clamps pitch", () => {
    expect(clampPitch(5)).toBe(MAX_PITCH);
    expect(clampPitch(-5)).toBe(-MAX_PITCH);
    expect(clampPitch(0.2)).toBe(0.2);
  });

  it("wraps yaw into one turn", () => {
    expect(wrapYaw(Math.PI * 2 + 0.5)).toBeCloseTo(0.5);
    expect(wrapYaw(-Math.PI - 0.5)).toBeCloseTo(Math.PI - 0.5);
  });

  it("widens the vertical view on narrow screens only", () => {
    expect(verticalFovForAspect(16 / 9)).toBe(62);
    expect(verticalFovForAspect(0.46)).toBeGreaterThan(62);
    expect(verticalFovForAspect(0.46)).toBeLessThanOrEqual(92);
  });
});

describe("targeting", () => {
  const teacher = INTERACTIONS.teacher;
  // In front of the teacher, looking straight at them.
  const inFront = { x: teacher.x, z: teacher.z + 1.5 };

  it("picks a target in reach and within aim", () => {
    expect(pickTarget(inFront, 0, 0, INTERACTIONS)).toBe("teacher");
  });

  it("does not pick a target in reach but looked away from", () => {
    expect(pickTarget(inFront, Math.PI, 0, INTERACTIONS)).toBeNull();
    expect(pickTarget(inFront, teacher.aim + 0.1, 0, INTERACTIONS)).toBeNull();
  });

  it("does not pick a target aimed at but out of reach", () => {
    const far = { x: teacher.x, z: teacher.z + teacher.reach + 0.5 };
    expect(aimAngle(far, 0, 0, teacher)).toBeCloseTo(0);
    expect(pickTarget(far, 0, 0, INTERACTIONS)).toBeNull();
  });

  it("does not pick a target when looking straight up", () => {
    expect(pickTarget(inFront, 0, 1.2, INTERACTIONS)).toBeNull();
  });

  it("picks the learning station when aimed at it", () => {
    const station = INTERACTIONS.study_spot;
    const nearby = { x: station.x - 1.5, z: station.z };
    expect(pickTarget(nearby, -Math.PI / 2, 0, INTERACTIONS)).toBe("study_spot");
  });

  it("prefers the target closest to the center of view", () => {
    const targets = {
      a: { x: -0.3, z: -1, reach: 3, aim: 0.6 },
      b: { x: 0.1, z: -1, reach: 3, aim: 0.6 },
    };
    expect(pickTarget({ x: 0, z: 0 }, 0, 0, targets)).toBe("b");
  });

  it("leaves a spot in reach of the real teacher that the player can stand on", () => {
    const spot = { x: TEACHER.x, z: TEACHER.z + 1.5 };
    expect(isFree(spot, realRoom)).toBe(true);
    expect(Math.hypot(spot.x - teacher.x, spot.z - teacher.z)).toBeLessThanOrEqual(teacher.reach);
  });
});
