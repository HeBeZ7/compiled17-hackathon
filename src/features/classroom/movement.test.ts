import { describe, expect, it } from "vitest";
import { isFree, nearestFree, normalizeInput, stepActor, type ActorState, type MoveWorld } from "./movement";
import { INTERACTABLES, MOVE_WORLD, PROPS, SPAWN_POSITION, TEACHER_POSITION } from "./world";

const room: MoveWorld = {
  bounds: { x: 0, y: 0, w: 400, h: 300 },
  obstacles: [{ x: 200, y: 100, w: 40, h: 40 }],
  footprint: { halfW: 10, halfH: 6 },
  speed: 100,
};

const at = (x: number, y: number): ActorState => ({ x, y, facing: "down", moving: false });

describe("stepActor", () => {
  it("changes world coordinates when given input", () => {
    const next = stepActor(at(50, 50), { x: 1, y: 0 }, 0.1, room);
    expect(next.x).toBeCloseTo(60);
    expect(next.y).toBe(50);
    expect(next.moving).toBe(true);
    expect(next.facing).toBe("right");
  });

  it("makes a diagonal cover the same distance as a straight line", () => {
    const diagonal = stepActor(at(50, 50), { x: 1, y: 1 }, 0.1, room);
    expect(Math.hypot(diagonal.x - 50, diagonal.y - 50)).toBeCloseTo(10);
  });

  it("stops and keeps facing when input is released", () => {
    const next = stepActor({ ...at(50, 50), facing: "left", moving: true }, { x: 0, y: 0 }, 0.1, room);
    expect(next).toEqual({ x: 50, y: 50, facing: "left", moving: false });
  });

  it("stops flush against an obstacle", () => {
    const next = stepActor(at(185, 120), { x: 1, y: 0 }, 0.2, room);
    expect(next.x).toBe(190);
  });

  it("slides along an obstacle when walking into it at an angle", () => {
    const next = stepActor(at(190, 120), { x: 1, y: 1 }, 0.1, room);
    expect(next.x).toBe(190);
    expect(next.y).toBeGreaterThan(120);
  });

  it("does not tunnel through an obstacle on a very long frame", () => {
    const fast = { ...room, speed: 4000 };
    expect(stepActor(at(150, 120), { x: 1, y: 0 }, 5, fast).x).toBeLessThanOrEqual(190);
  });

  it("keeps the footprint inside the room", () => {
    const next = stepActor(at(12, 8), { x: -1, y: -1 }, 1, room);
    expect(next.x).toBe(10);
    expect(next.y).toBe(6);
  });

  it("reports not moving while pushing into a wall", () => {
    expect(stepActor(at(10, 50), { x: -1, y: 0 }, 0.1, room).moving).toBe(false);
  });

  it("ignores non-finite input", () => {
    expect(normalizeInput({ x: Number.NaN, y: 1 })).toEqual({ x: 0, y: 0 });
  });
});

describe("nearestFree", () => {
  it("keeps a spot that is already free", () => {
    expect(nearestFree({ x: 50, y: 50 }, room)).toEqual({ x: 50, y: 50 });
  });

  it("pulls an out-of-bounds spot back inside", () => {
    expect(nearestFree({ x: -40, y: 50 }, room)).toEqual({ x: 10, y: 50 });
  });

  it("moves a spot out of an obstacle", () => {
    const spot = nearestFree({ x: 220, y: 120 }, room);
    expect(spot).not.toBeNull();
    expect(isFree(spot!, room)).toBe(true);
  });
});

describe("the classroom layout", () => {
  it("spawns the player somewhere free", () => {
    expect(isFree(SPAWN_POSITION, MOVE_WORLD)).toBe(true);
  });

  it("does not place the teacher inside furniture", () => {
    for (const prop of PROPS) {
      const c = prop.collider;
      const inside =
        TEACHER_POSITION.x > c.x &&
        TEACHER_POSITION.x < c.x + c.w &&
        TEACHER_POSITION.y > c.y &&
        TEACHER_POSITION.y < c.y + c.h;
      expect(inside, prop.id).toBe(false);
    }
  });

  it("lets the player reach every interactable from spawn", () => {
    // Flood-fill the free floor on a grid finer than the footprint.
    const step = 8;
    const seen = new Set<string>();
    const start = {
      x: Math.round(SPAWN_POSITION.x / step) * step,
      y: Math.round(SPAWN_POSITION.y / step) * step,
    };
    const queue = [start];
    seen.add(`${start.x},${start.y}`);
    while (queue.length > 0) {
      const { x, y } = queue.pop()!;
      for (const [dx, dy] of [[step, 0], [-step, 0], [0, step], [0, -step]] as const) {
        const next = { x: x + dx, y: y + dy };
        const key = `${next.x},${next.y}`;
        if (!seen.has(key) && isFree(next, MOVE_WORLD)) {
          seen.add(key);
          queue.push(next);
        }
      }
    }
    for (const item of INTERACTABLES) {
      const reachable = [...seen].some((key) => {
        const [x, y] = key.split(",").map(Number) as [number, number];
        const dx = Math.max(item.zone.x - x, 0, x - (item.zone.x + item.zone.w));
        const dy = Math.max(item.zone.y - y, 0, y - (item.zone.y + item.zone.h));
        return Math.hypot(dx, dy) <= item.reach;
      });
      expect(reachable, item.id).toBe(true);
    }
  });
});
