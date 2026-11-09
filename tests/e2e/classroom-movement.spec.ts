import { expect, test } from "@playwright/test";
import { closeTeacher, enterClassroom, expectStopped, holdKeys, id, openTeacher, pause, RUNWAY, seedAgent, snap, speed, teleport, teleportTo } from "./support/app";

test.skip(!process.env.AA_QA_E2E, "제품 hook 통합 전 미실행. 대상 커밋 검증 때 AA_QA_E2E=1로 실행한다.");

// A-01~03. 실제 브라우저 입력 경로를 쓰되 창 전환은 headless 한계로 blur 합성 이벤트다.
test.describe("교실 이동·충돌·입력 해제", () => {
  test.beforeEach(async ({ page }) => { await enterClassroom(page); });

  test("C1 방향키로 월드 좌표가 변하고 키를 떼면 멈춘다", async ({ page }) => {
    const a = await snap(page);
    await holdKeys(page, ["ArrowRight"], 400);
    await expectStopped(page);
    expect((await snap(page)).footprint.x).toBeGreaterThan(a.footprint.x + 10);
  });

  test("C2 WASD로도 이동한다", async ({ page }) => {
    const a = await snap(page);
    await holdKeys(page, ["w"], 300);
    expect((await snap(page)).footprint.y).toBeLessThan(a.footprint.y - 5);
  });

  test("C3 대각선 이동이 직선보다 빠르지 않다", async ({ page }) => {
    await teleportTo(page, RUNWAY);
    const straight = await speed(page, ["ArrowRight"]);
    await teleportTo(page, RUNWAY);
    const diagonal = await speed(page, ["ArrowRight", "ArrowDown"]);
    expect(diagonal).toBeLessThan(straight * 1.15);
  });

  test("C4 벽을 통과하지 못한다", async ({ page }) => {
    await holdKeys(page, ["ArrowLeft"], 3000);
    const s = await snap(page);
    expect(s.footprint.x).toBeGreaterThanOrEqual(0);
  });

  test("C5 책상과 겹치지 않는다", async ({ page }) => {
    const s = await snap(page);
    const desk = s.obstacles[0];
    await teleport(page, desk.x - s.footprint.w - 20, desk.y + desk.h / 2 - s.footprint.h / 2);
    await holdKeys(page, ["ArrowRight"], 1500);
    const after = await snap(page);
    expect(after.footprint.x + after.footprint.w).toBeLessThanOrEqual(desk.x + 1);
  });

  test("C6 키를 누른 채 창 포커스를 잃으면 멈춘다 (blur 합성)", async ({ page }) => {
    await page.keyboard.down("ArrowRight");
    await pause(page, 150);
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    await expectStopped(page);
    await page.keyboard.up("ArrowRight");
  });

  test("C7 화면 방향패드는 pointercancel에서 멈춘다", async ({ page }) => {
    const pad = page.locator(id("dpad-right"));
    await pad.dispatchEvent("pointerdown", { pointerId: 7, bubbles: true });
    await pause(page, 150);
    await pad.dispatchEvent("pointercancel", { pointerId: 7, bubbles: true });
    await expectStopped(page);
  });

  test("C8 키를 누른 채 대화를 열면 멈추고 닫아도 저절로 움직이지 않는다", async ({ page }) => {
    await page.keyboard.down("ArrowRight");
    await openTeacher(page);
    await expectStopped(page);
    expect((await snap(page)).paused).toBe(true);
    await page.keyboard.up("ArrowRight");
    await closeTeacher(page);
    await expectStopped(page);
    expect((await snap(page)).paused).toBe(false);
  });

  test("C9 대화 입력 중 타이핑은 캐릭터를 움직이지 않고 글자가 그대로 들어간다", async ({ page }) => {
    // 상담 입력창은 에이전트가 있어야 활성화된다.
    await seedAgent(page);
    await enterClassroom(page);
    await openTeacher(page);
    const before = await snap(page);
    const box = page.locator(id("teacher-input"));
    await box.click();
    await box.pressSequentially("wasd wasd");
    await expect(box).toHaveValue("wasd wasd");
    // 지연 없는 입력은 프레임 사이에 끝날 수 있으므로 키를 실제로 누른 채 유지해 확인한다.
    await holdKeys(page, ["d"], 300);
    await holdKeys(page, ["ArrowLeft"], 300);
    const after = await snap(page);
    expect(after.footprint.x).toBe(before.footprint.x);
    expect(after.footprint.y).toBe(before.footprint.y);
  });

  test("C10 대화를 닫으면 이동이 재개된다", async ({ page }) => {
    await openTeacher(page);
    await closeTeacher(page);
    const a = await snap(page);
    await holdKeys(page, ["ArrowLeft"], 300);
    expect((await snap(page)).footprint.x).toBeLessThan(a.footprint.x - 5);
  });

  test("C11 교실 재진입 뒤에도 속도가 같다 (리스너 중복 확인)", async ({ page }) => {
    await teleportTo(page, RUNWAY);
    const first = await speed(page, ["ArrowRight"]);
    await page.evaluate(() => window.__AA_TEST__!.classroom!.remount());
    await page.waitForFunction(() => window.__AA_TEST__?.classroom?.ready() === true);
    await teleportTo(page, RUNWAY);
    const second = await speed(page, ["ArrowRight"]);
    expect(second).toBeLessThan(first * 1.3);
  });
});
