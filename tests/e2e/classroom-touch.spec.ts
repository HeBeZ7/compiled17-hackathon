import { expect, test, type Page } from "@playwright/test";
import {
  AISLE,
  TEACHER_SPOT,
  classroomRoot,
  closeTeacher,
  enterClassroom,
  expectNoOverlap,
  expectNoSideScroll,
  expectStopped,
  expectWalking,
  id,
  interactPrompt,
  lookPrompt,
  myAgentPill,
  pause,
  place,
  snap,
  teacherDialog,
} from "./support/app";
import { touchDriver } from "./support/browser-doubles";

test.skip(!process.env.AA_QA_E2E, "Not run without the product hook. Run with AA_QA_E2E=1 against the target commit.");
test.describe.configure({ timeout: 60_000 });

// Touch emulation at 390 px through the browser's real touch input pipeline. Not a real touch device.
// Scoped with test.use so playwright.config.ts, which A owns, does not need to change.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const stick = (page: Page) => page.locator(id("classroom-joystick"));
const lookZone = (page: Page) => page.locator(id("classroom-look-zone"));

async function center(page: Page, testId: string) {
  const box = (await page.locator(id(testId)).boundingBox())!;
  return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
}

test.describe("touch controls at 390 px", () => {
  test.beforeEach(async ({ page, browserName: _ }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Touch emulation sets its own viewport, so it runs once");
    await enterClassroom(page);
    await expect(stick(page)).toBeVisible();
  });

  test("J1 pushing the joystick up walks forward and releasing stops", async ({ page }) => {
    await place(page, AISLE);
    const c = await center(page, "classroom-joystick");
    const touch = await touchDriver(page);
    const a = await snap(page);
    await touch.start([{ id: 1, x: c.x, y: c.y }]);
    await touch.move([{ id: 1, x: c.x, y: c.y - 40 }]);
    await expectWalking(page);
    await touch.end();
    await expectStopped(page);
    const b = await snap(page);
    expect(b.position.z).toBeLessThan(a.position.z - 0.1);
    expect(Math.abs(b.position.x - a.position.x)).toBeLessThan(0.1);
  });

  test("J2 pushing the joystick right strafes relative to the view", async ({ page }) => {
    await place(page, { ...AISLE, yaw: Math.PI / 2, z: 2.4 });
    const c = await center(page, "classroom-joystick");
    const touch = await touchDriver(page);
    const a = await snap(page);
    await touch.start([{ id: 1, x: c.x, y: c.y }]);
    await touch.move([{ id: 1, x: c.x + 40, y: c.y }]);
    await pause(page, 300);
    await touch.end();
    await expectStopped(page);
    // Facing -x, the player's right is -z.
    expect((await snap(page)).position.z).toBeLessThan(a.position.z - 0.1);
  });

  test("J3 dragging the look zone turns the view and clamps pitch without walking", async ({ page }) => {
    await place(page, AISLE);
    const c = await center(page, "classroom-look-zone");
    const touch = await touchDriver(page);
    const a = await snap(page);
    await touch.start([{ id: 1, x: c.x, y: c.y }]);
    await touch.move([{ id: 1, x: c.x + 60, y: c.y }]);
    await pause(page, 120);
    const turned = await snap(page);
    expect(turned.yaw, "dragging right must turn right").toBeLessThan(a.yaw - 0.05);
    expect(turned.position).toEqual(a.position);

    await touch.end();

    for (let stroke = 0; stroke < 3; stroke++) {
      await touch.start([{ id: 1, x: c.x, y: c.y + 150 }]);
      await touch.move([{ id: 1, x: c.x, y: c.y - 150 }]);
      await touch.end();
    }
    await pause(page, 120);
    const pitched = await snap(page);
    expect(pitched.pitch).toBeGreaterThan(1);
    expect(pitched.pitch).toBeLessThan(Math.PI / 2);
  });

  test("J4 moving and looking work together with two fingers", async ({ page }) => {
    await place(page, AISLE);
    const s = await center(page, "classroom-joystick");
    const l = await center(page, "classroom-look-zone");
    const touch = await touchDriver(page);
    const a = await snap(page);
    await touch.start([{ id: 1, x: s.x, y: s.y }, { id: 2, x: l.x, y: l.y }]);
    await touch.move([{ id: 1, x: s.x, y: s.y - 40 }, { id: 2, x: l.x + 50, y: l.y }]);
    await expectWalking(page);
    await touch.end();
    await expectStopped(page);
    const b = await snap(page);
    expect(b.yaw).not.toBe(a.yaw);
    expect(b.position.z).toBeLessThan(a.position.z - 0.1);
  });

  test("J5 touchcancel on the joystick clears movement and the knob", async ({ page }) => {
    await place(page, AISLE);
    const c = await center(page, "classroom-joystick");
    const touch = await touchDriver(page);
    await touch.start([{ id: 1, x: c.x, y: c.y }]);
    await touch.move([{ id: 1, x: c.x, y: c.y - 40 }]);
    await expectWalking(page);
    await touch.cancel();
    await expectStopped(page);
  });

  test("J6 the teacher opens with a tap, the joystick is dead while it is open and nothing restarts on close", async ({ page }) => {
    await place(page, TEACHER_SPOT);
    await interactPrompt(page).tap();
    await expect(teacherDialog(page)).toBeVisible();
    expect((await snap(page)).paused).toBe(true);

    const c = await center(page, "classroom-joystick");
    const touch = await touchDriver(page);
    const a = await snap(page);
    await touch.start([{ id: 1, x: c.x, y: c.y }]);
    await touch.move([{ id: 1, x: c.x, y: c.y - 40 }]);
    await pause(page, 300);
    await touch.end();
    expect((await snap(page)).position).toEqual(a.position);

    await closeTeacher(page);
    await expect(teacherDialog(page)).toBeHidden();
    await expectStopped(page);
  });

  test("J7 touch mode has no capture prompt, its controls do not overlap and the page does not scroll", async ({ page }) => {
    await place(page, TEACHER_SPOT);
    await expect(classroomRoot(page)).toHaveAttribute("data-load-state", "ready");
    await expect(lookPrompt(page)).toBeHidden();
    await expect(page.locator(id("classroom-hint"))).toBeHidden();
    await expectNoOverlap(page, {
      joystick: stick(page),
      "interact prompt": interactPrompt(page),
      "My agent pill": myAgentPill(page),
      "My character button": page.locator(id("classroom-character-toggle")),
    });
    await expect(lookZone(page)).toBeVisible();
    await expectNoSideScroll(page);
  });
});
