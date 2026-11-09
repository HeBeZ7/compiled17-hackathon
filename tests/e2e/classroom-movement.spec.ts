import { expect, test } from "@playwright/test";
import {
  BOX_COLLIDERS,
  CIRCLE_COLLIDERS,
  PLAYER,
  ROOM,
  SPAWN,
  STUDENT_CHAIRS,
  STUDENT_DESKS,
  TEACHER,
  TEACHER_DESK,
} from "../../src/shared/world/layout";
import {
  AISLE,
  OPEN_FLOOR,
  classroomRoot,
  closeTeacher,
  distance,
  enterClassroom,
  expectStopped,
  expectWalking,
  forwardOf,
  holdKeys,
  id,
  openTeacher,
  pause,
  place,
  rightOf,
  seedAgent,
  snap,
  speed,
  teacherDialog,
  waitClassroomReady,
  type Pose,
  type Vec,
} from "./support/app";
import { frameCount, hidePage, installFrameThrottle, setFrameDelay } from "./support/browser-doubles";

test.skip(!process.env.AA_QA_E2E, "Not run without the product hook. Run with AA_QA_E2E=1 against the target commit.");
test.describe.configure({ timeout: 60_000 });

// A-15, R-021 to R-024, and the intent of A-01 to A-03. Real key events and real world coordinates.
// Blur, visibilitychange and pointercancel are synthetic events: they do not prove a real OS window switch.
const R = PLAYER.radius;

/** How far the player's edge is from a box surface. Negative means it is inside. */
function gapToBox(p: Vec, b: { x: number; z: number; w: number; d: number }) {
  const dx = Math.max(Math.abs(p.x - b.x) - b.w / 2, 0);
  const dz = Math.max(Math.abs(p.z - b.z) - b.d / 2, 0);
  return Math.hypot(dx, dz) - R;
}
const gapToCircle = (p: Vec, c: { x: number; z: number; r: number }) => distance(p, c) - c.r - R;

test.describe("first-person movement", () => {
  test.beforeEach(async ({ page }) => { await enterClassroom(page); });

  test("C0 the hook reports the world from layout.ts and the player starts at the spawn point", async ({ page }) => {
    const s = await snap(page);
    expect(s.world.ROOM).toEqual(ROOM);
    expect(s.colliders.boxes).toEqual(BOX_COLLIDERS);
    expect(s.colliders.circles).toEqual(CIRCLE_COLLIDERS);
    expect(s.position.x).toBeCloseTo(SPAWN.x, 5);
    expect(s.position.z).toBeCloseTo(SPAWN.z, 5);
    expect(s.yaw).toBeCloseTo(SPAWN.yaw, 5);
    await expect(classroomRoot(page).locator("canvas")).toHaveCount(1);
  });

  test("C1 W walks forward in world coordinates and releasing it stops", async ({ page }) => {
    await place(page, AISLE);
    const a = await snap(page);
    await holdKeys(page, ["KeyW"], 500);
    await expectStopped(page);
    const b = await snap(page);
    expect(b.position.z).toBeLessThan(a.position.z - 0.3);
    expect(Math.abs(b.position.x - a.position.x)).toBeLessThan(0.02);
  });

  test("C2 WASD moves relative to where the player faces", async ({ page }) => {
    const directions: [string, (yaw: number) => Vec][] = [
      ["KeyW", (yaw) => forwardOf(yaw)],
      ["KeyS", (yaw) => { const f = forwardOf(yaw); return { x: -f.x, z: -f.z }; }],
      ["KeyD", (yaw) => rightOf(yaw)],
      ["KeyA", (yaw) => { const r = rightOf(yaw); return { x: -r.x, z: -r.z }; }],
    ];
    for (const yaw of [0, Math.PI / 2, -Math.PI / 2, 0.6, 2.4]) {
      for (const [key, expected] of directions) {
        await place(page, { ...OPEN_FLOOR, yaw });
        await holdKeys(page, [key], 250);
        await pause(page, 120);
        const moved = (await snap(page)).position;
        const delta = { x: moved.x - OPEN_FLOOR.x, z: moved.z - OPEN_FLOOR.z };
        const length = Math.hypot(delta.x, delta.z);
        const want = expected(yaw);
        expect(length, `${key} at yaw ${yaw} did not move`).toBeGreaterThan(0.1);
        expect((delta.x * want.x + delta.z * want.z) / length, `${key} at yaw ${yaw} went the wrong way`).toBeGreaterThan(0.98);
      }
    }
  });

  test("C3 diagonal input is not faster than straight input and speed is the walk speed", async ({ page }) => {
    await place(page, AISLE);
    const straight = await speed(page, ["KeyW"]);
    // At this yaw W+D runs exactly along the aisle, so both measurements use the same clear floor.
    await place(page, { ...AISLE, yaw: Math.PI / 4 });
    const start = (await snap(page)).position;
    const diagonal = await speed(page, ["KeyW", "KeyD"]);
    const end = (await snap(page)).position;

    expect(Math.abs(end.x - start.x), "W+D must combine both keys").toBeLessThan(0.15);
    expect(straight).toBeGreaterThan(PLAYER.walkSpeed * 0.85);
    expect(straight).toBeLessThan(PLAYER.walkSpeed * 1.15);
    expect(diagonal).toBeLessThan(straight * 1.1);
    expect(diagonal).toBeGreaterThan(straight * 0.85);
  });

  test("C4 all four walls stop the player at the wall", async ({ page }) => {
    const walls: { name: string; pose: Pose; gap: (p: Vec) => number }[] = [
      { name: "left", pose: { x: ROOM.minX + 0.9, z: OPEN_FLOOR.z, yaw: Math.PI / 2 }, gap: (p) => p.x - ROOM.minX - R },
      { name: "right", pose: { x: ROOM.maxX - 0.9, z: OPEN_FLOOR.z, yaw: -Math.PI / 2 }, gap: (p) => ROOM.maxX - p.x - R },
      { name: "front", pose: { x: 0, z: ROOM.minZ + 0.9, yaw: 0 }, gap: (p) => p.z - ROOM.minZ - R },
      { name: "back", pose: { x: 0, z: ROOM.maxZ - 0.9, yaw: Math.PI }, gap: (p) => ROOM.maxZ - p.z - R },
    ];
    for (const wall of walls) {
      await place(page, wall.pose);
      await holdKeys(page, ["KeyW"], 900);
      await pause(page, 120);
      const gap = wall.gap((await snap(page)).position);
      expect(gap, `${wall.name} wall was crossed`).toBeGreaterThanOrEqual(-0.005);
      expect(gap, `${wall.name} wall was never reached`).toBeLessThan(0.03);
    }
  });

  const obstacles: { id: string; name: string; pose: Pose; gap: (p: Vec) => number }[] = [
    { id: "C5", name: "a student desk", pose: { x: -1.0, z: STUDENT_DESKS[2].z, yaw: Math.PI / 2 }, gap: (p) => gapToBox(p, STUDENT_DESKS[2]) },
    { id: "C13", name: "the teacher desk", pose: { x: TEACHER_DESK.x, z: -2.2, yaw: 0 }, gap: (p) => gapToBox(p, TEACHER_DESK) },
    { id: "C14", name: "a student chair", pose: { x: STUDENT_CHAIRS[2].x, z: 2.6, yaw: 0 }, gap: (p) => gapToCircle(p, STUDENT_CHAIRS[2]) },
    { id: "C15", name: "the teacher", pose: { x: TEACHER.x, z: TEACHER.z + 1.4, yaw: 0 }, gap: (p) => gapToCircle(p, TEACHER) },
  ];
  for (const obstacle of obstacles) {
    test(`${obstacle.id} walking into ${obstacle.name} stops at its surface`, async ({ page }) => {
      await place(page, obstacle.pose);
      await holdKeys(page, ["KeyW"], 1100);
      await pause(page, 120);
      const gap = obstacle.gap((await snap(page)).position);
      expect(gap, "player entered the obstacle").toBeGreaterThanOrEqual(-0.005);
      expect(gap, "player never reached the obstacle").toBeLessThan(0.03);
    });
  }

  test("C6 holding a key through window blur stops the player and it stays stopped", async ({ page }) => {
    await place(page, AISLE);
    await page.keyboard.down("KeyW");
    await expectWalking(page);
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    await expectStopped(page);
    await page.keyboard.up("KeyW");
  });

  test("C7 pointercancel clears held input", async ({ page }) => {
    await place(page, AISLE);
    await page.keyboard.down("KeyW");
    await expectWalking(page);
    await page.evaluate(() => window.dispatchEvent(new PointerEvent("pointercancel", { pointerId: 7 })));
    await expectStopped(page);
    await page.keyboard.up("KeyW");
  });

  test("C16 visibilitychange clears held input", async ({ page }) => {
    await place(page, AISLE);
    await page.keyboard.down("KeyW");
    await expectWalking(page);
    await hidePage(page);
    await expectStopped(page);
    await page.keyboard.up("KeyW");
  });

  test("C17 key auto-repeat does not revive input that blur cleared", async ({ page }) => {
    await place(page, AISLE);
    await page.keyboard.down("KeyW");
    await expectWalking(page);
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    await expectStopped(page);
    // A second down without an up is delivered as an auto-repeat keydown.
    await page.keyboard.down("KeyW");
    await expectStopped(page);
    await page.keyboard.up("KeyW");
  });

  test("C8 opening a dialog with a key held stops the player and closing never restarts it", async ({ page }) => {
    await place(page, AISLE);
    await page.keyboard.down("KeyW");
    await expectWalking(page);
    await openTeacher(page);
    await expectStopped(page);
    expect((await snap(page)).paused).toBe(true);
    await page.keyboard.up("KeyW");
    await closeTeacher(page);
    await expectStopped(page);
    expect((await snap(page)).paused).toBe(false);
  });

  test("C9 typing in the dialog enters the letters and never moves the player or the camera", async ({ page }) => {
    await seedAgent(page);
    await enterClassroom(page);
    await openTeacher(page);
    const before = await snap(page);
    const box = page.locator(id("teacher-input"));
    await box.click();
    await box.pressSequentially("wasd wasd");
    await expect(box).toHaveValue("wasd wasd");
    // Fast typing can land between two frames, so the keys are also held across frames.
    await holdKeys(page, ["KeyD"], 300);
    await holdKeys(page, ["ArrowLeft"], 300);
    await page.mouse.move(40, 40);
    await page.mouse.move(300, 200, { steps: 4 });
    await pause(page, 150);
    const after = await snap(page);
    expect(after.position).toEqual(before.position);
    expect(after.yaw).toBe(before.yaw);
    expect(after.pitch).toBe(before.pitch);
  });

  test("C10 closing a dialog lets the player walk again", async ({ page }) => {
    await openTeacher(page);
    await closeTeacher(page);
    await expect(teacherDialog(page)).toBeHidden();
    const a = await snap(page);
    await holdKeys(page, ["KeyS"], 300);
    await pause(page, 120);
    expect(distance((await snap(page)).position, a.position)).toBeGreaterThan(0.1);
  });

  test("C11 speed is the same after the classroom is remounted", async ({ page }) => {
    await place(page, AISLE);
    const first = await speed(page, ["KeyW"]);
    await page.evaluate(() => window.__AA_TEST__!.classroom!.remount());
    await waitClassroomReady(page);
    await place(page, AISLE);
    const second = await speed(page, ["KeyW"]);
    expect(second).toBeLessThan(first * 1.15);
    expect(second).toBeGreaterThan(first * 0.85);
  });

  test("C19 the camera renders real geometry: turning and walking both change the picture", async ({ page }) => {
    const canvas = classroomRoot(page).locator("canvas").first();
    const capture = async () => {
      await pause(page, 300);
      return canvas.screenshot();
    };
    const changedShare = (a: Buffer, b: Buffer) =>
      page.evaluate(async ([x, y]) => {
        const read = async (b64: string) => {
          const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
          const bmp = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
          const c = new OffscreenCanvas(bmp.width, bmp.height).getContext("2d")!;
          c.drawImage(bmp, 0, 0);
          return c.getImageData(0, 0, bmp.width, bmp.height).data;
        };
        const [p, q] = await Promise.all([read(x), read(y)]);
        let changed = 0;
        for (let i = 0; i < p.length; i += 4) {
          if (Math.abs(p[i] - q[i]) + Math.abs(p[i + 1] - q[i + 1]) + Math.abs(p[i + 2] - q[i + 2]) > 30) changed++;
        }
        return changed / (p.length / 4);
      }, [a.toString("base64"), b.toString("base64")]);

    await place(page, AISLE);
    const start = await capture();
    await place(page, { ...AISLE, yaw: Math.PI / 2 });
    const turned = await capture();
    await place(page, { x: AISLE.x, z: AISLE.z - 3, yaw: AISLE.yaw });
    const walked = await capture();
    await place(page, AISLE);
    const back = await capture();

    expect(await changedShare(start, turned), "turning must change the view").toBeGreaterThan(0.2);
    expect(await changedShare(start, walked), "moving must change the view").toBeGreaterThan(0.05);
    expect(await changedShare(start, back), "same pose must give the same view").toBeLessThan(0.02);
  });
});

test.describe("frame-rate independence", () => {
  test.beforeEach(async ({ page }) => {
    await installFrameThrottle(page);
    await enterClassroom(page);
  });

  /** Speed and frames per second over one walk. Throttled frames are far apart, so the window is longer. */
  async function measure(page: Parameters<typeof speed>[0]) {
    await place(page, AISLE);
    const f0 = await frameCount(page);
    const t0 = Date.now();
    const metersPerSecond = await speed(page, ["KeyW"], 1500);
    const seconds = (Date.now() - t0) / 1000;
    return { metersPerSecond, fps: ((await frameCount(page)) - f0) / seconds };
  }

  test("C12 walking speed is the same when the frame rate is much lower", async ({ page }, testInfo) => {
    const fast = await measure(page);
    await setFrameDelay(page, 90);
    const slow = await measure(page);
    await setFrameDelay(page, 0);
    await testInfo.attach("frame-rates", { body: JSON.stringify({ fast, slow }), contentType: "application/json" });

    // The comparison only means something if the frame rate really differed.
    expect(slow.fps).toBeLessThan(fast.fps * 0.7);
    expect(slow.fps).toBeGreaterThan(4); // Below this the product's per-frame time cap applies by design.
    expect(slow.metersPerSecond).toBeGreaterThan(fast.metersPerSecond * 0.85);
    expect(slow.metersPerSecond).toBeLessThan(fast.metersPerSecond * 1.15);
  });
});
