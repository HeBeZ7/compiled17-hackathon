// The one classroom: its size, furniture placement and collision shapes.
// Art and collision read the same numbers, so what you see is what you bump.

import type { ClassroomTarget } from "@/shared/contracts";
import type { Box, MoveWorld, Vec2 } from "./movement";

export const WORLD_WIDTH = 1200;
export const WORLD_HEIGHT = 780;

/** Where the back wall meets the floor. */
export const FLOOR_TOP = 244;
/** Where the floor is cut off by the front of the diorama. */
export const FLOOR_BOTTOM = 742;

export type PropKind = "studentDesk" | "chair" | "teacherDesk" | "studyNook" | "plant" | "bookcase";

export type Prop = {
  id: string;
  kind: PropKind;
  /** Bottom-centre of the art, in world pixels. */
  x: number;
  y: number;
  collider: Box;
};

/** A desk and the chair tucked in on the side facing the room. */
function deskAt(id: string, x: number, y: number): Prop[] {
  return [
    { id, kind: "studentDesk", x, y, collider: { x: x - 72, y: y - 46, w: 144, h: 46 } },
    {
      id: `${id}-chair`,
      kind: "chair",
      x,
      y: y + 34,
      collider: { x: x - 26, y: y + 6, w: 52, h: 26 },
    },
  ];
}

export const PROPS: readonly Prop[] = [
  {
    id: "teacher-desk",
    kind: "teacherDesk",
    x: 500,
    y: 372,
    collider: { x: 388, y: 316, w: 224, h: 56 },
  },
  ...deskAt("desk-a1", 300, 520),
  ...deskAt("desk-a2", 600, 520),
  ...deskAt("desk-a3", 900, 520),
  ...deskAt("desk-b1", 300, 668),
  ...deskAt("desk-b2", 600, 668),
  {
    id: "study-nook",
    kind: "studyNook",
    x: 985,
    y: 700,
    collider: { x: 895, y: 648, w: 180, h: 52 },
  },
  {
    id: "bookcase",
    kind: "bookcase",
    x: 166,
    y: 306,
    collider: { x: 88, y: 262, w: 156, h: 44 },
  },
  {
    id: "plant-left",
    kind: "plant",
    x: 124,
    y: 492,
    collider: { x: 98, y: 470, w: 52, h: 26 },
  },
  {
    id: "plant-right",
    kind: "plant",
    x: 1076,
    y: 318,
    collider: { x: 1050, y: 296, w: 52, h: 26 },
  },
];

/** The teacher stands clear of the desk so they can be walked up to. */
export const TEACHER_POSITION: Vec2 = { x: 760, y: 344 };
export const TEACHER_COLLIDER: Box = { x: 734, y: 328, w: 52, h: 26 };

export const SPAWN_POSITION: Vec2 = { x: 450, y: 594 };

export const MOVE_WORLD: MoveWorld = {
  bounds: { x: 84, y: FLOOR_TOP + 8, w: 1032, h: FLOOR_BOTTOM - FLOOR_TOP - 10 },
  obstacles: [...PROPS.map((prop) => prop.collider), TEACHER_COLLIDER],
  footprint: { halfW: 18, halfH: 10 },
  speed: 250,
};

export type Interactable = {
  id: ClassroomTarget;
  zone: Box;
  /** How far from the zone the prompt appears. */
  reach: number;
};

export const INTERACTABLES: readonly Interactable[] = [
  { id: "teacher", zone: TEACHER_COLLIDER, reach: 58 },
  { id: "study_spot", zone: { x: 895, y: 648, w: 180, h: 52 }, reach: 46 },
];
