import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  closeTeacher,
  colorShare,
  enterClassroom,
  id,
  learningDialog,
  openTeacher,
  pause,
  paths,
  playerShare,
  seedAgent,
  seedAvatarAgent,
  snap,
  STUDY_SPOT,
  teacherDialog,
  teleport,
  teleportTo,
  INTERACT_KEY,
  type Snapshot,
} from "./support/app";

test.skip(!process.env.AA_QA_E2E, "제품 hook 통합 전 미실행. 대상 커밋 검증 때 AA_QA_E2E=1로 실행한다.");

// 화면에 그려진 말풍선·버튼·가림이 실제 동작인지 본다. 카메라 좌표는 snapshot에서 역산한다.
const MAGENTA: [number, number, number] = [255, 0, 170];
const WHITE: [number, number, number] = [255, 255, 255];
const STANDEE_WIDTH = 112;
const STANDEE_FOOT = { x: 56, y: 124 };
/** B의 ClassroomScene PROMPT_ANCHOR(말풍선 본체 중심)와 world.ts의 책상 값. 배치가 바뀌면 R4·O1이 실패한다. */
const TEACHER_BUBBLE = { x: 804, y: 163 };
const STUDENT_DESK = { x: 528, y: 474, w: 144, h: 46 };
const DESK_SIDE_X = 512;

function toScreen(s: Snapshot, world: { x: number; y: number }) {
  const scale = s.screen.w / STANDEE_WIDTH;
  const actorX = s.footprint.x + s.footprint.w / 2;
  const actorY = s.footprint.y + s.footprint.h / 2;
  const viewX = actorX - STANDEE_FOOT.x - s.screen.x / scale;
  const viewY = actorY - STANDEE_FOOT.y - s.screen.y / scale;
  return { x: (world.x - viewX) * scale, y: (world.y - viewY) * scale, scale };
}

async function bubbleWhiteShare(page: Page) {
  const s = await snap(page);
  const at = toScreen(s, TEACHER_BUBBLE);
  const half = 16 * at.scale;
  const canvas = (await page.locator("canvas").first().boundingBox())!;
  const clip = { x: canvas.x + at.x - half, y: canvas.y + at.y - half, width: half * 2, height: half * 2 };
  expect(clip.x, "말풍선 위치가 화면 밖").toBeGreaterThanOrEqual(0);
  expect(clip.y, "말풍선 위치가 화면 밖").toBeGreaterThanOrEqual(0);
  return colorShare(page, await page.screenshot({ clip }), WHITE);
}

const promptButton = (page: Page, name: RegExp) => page.getByRole("button", { name });

function overlaps(a: { x: number; y: number; width: number; height: number }, b: typeof a) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

async function expectNoOverlap(page: Page, items: Record<string, Locator>) {
  const viewport = page.viewportSize()!;
  const boxes: [string, NonNullable<Awaited<ReturnType<Locator["boundingBox"]>>>][] = [];
  for (const [name, locator] of Object.entries(items)) {
    await expect(locator, name).toBeVisible();
    const box = (await locator.boundingBox())!;
    expect(box.x, `${name} 왼쪽 넘침`).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, `${name} 오른쪽 넘침`).toBeLessThanOrEqual(viewport.width);
    boxes.push([name, box]);
  }
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      expect(overlaps(boxes[i][1], boxes[j][1]), `${boxes[i][0]} ↔ ${boxes[j][0]} 겹침`).toBe(false);
    }
  }
}

async function expectOnTop(locator: Locator, name: string) {
  await locator.scrollIntoViewIfNeeded();
  const hit = await locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const top = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return top === element || element.contains(top) || (top?.contains(element) ?? false);
  });
  expect(hit, `${name}이(가) 다른 요소에 가려짐`).toBe(true);
}

test.describe("말풍선·버튼의 실제 동작", () => {
  test.beforeEach(async ({ page }) => { await enterClassroom(page); });

  test("R1 선생님 근처 버튼을 누르면 실제 상담창이 열리고 멀어지면 버튼이 사라진다", async ({ page }) => {
    const s = await snap(page);
    const button = promptButton(page, /선생님과 이야기하기/);
    await expect(button).toBeHidden();

    await teleport(page, s.teacher.x, s.teacher.y + 50);
    await expect(button).toBeVisible();
    await expect(page.locator(id("classroom"))).toHaveAttribute("data-near", "teacher");

    await button.click();
    await expect(teacherDialog(page)).toBeVisible();
    await expect(button).toBeHidden();
    expect((await snap(page)).paused).toBe(true);
    await closeTeacher(page);

    await teleport(page, s.teacher.x, s.teacher.y + 130);
    await expect(button).toBeHidden();
    await expect(page.locator(id("classroom"))).toHaveAttribute("data-near", "");
  });

  test("R2 학습 자리 근처 버튼을 누르면 실제 학습 패널이 열린다", async ({ page }) => {
    await teleportTo(page, STUDY_SPOT);
    await promptButton(page, /학습 자리 살펴보기/).click();
    await expect(learningDialog(page)).toBeVisible();
  });

  test("R3 대상에서 멀 때 상호작용 키는 아무것도 열지 않는다", async ({ page }) => {
    const s = await snap(page);
    await teleport(page, s.teacher.x, s.teacher.y + 130);
    await page.keyboard.press(INTERACT_KEY);
    await pause(page, 300);
    await expect(teacherDialog(page)).toBeHidden();
    await expect(learningDialog(page)).toBeHidden();
  });

  test("R4 캔버스 말풍선은 배경 그림이 아니라 근접 상태에 따라 나타난다", async ({ page }) => {
    await seedAvatarAgent(page, "rgb(255,0,170)");
    await enterClassroom(page);
    const s = await snap(page);

    await teleport(page, s.teacher.x, s.teacher.y + 130);
    await pause(page, 300);
    const away = await bubbleWhiteShare(page);

    await teleport(page, s.teacher.x, s.teacher.y + 50);
    await pause(page, 300);
    const near = await bubbleWhiteShare(page);

    await teleport(page, s.teacher.x, s.teacher.y + 130);
    await pause(page, 300);
    const awayAgain = await bubbleWhiteShare(page);

    expect(near).toBeGreaterThan(away + 0.2);
    expect(awayAgain).toBeLessThan(near - 0.2);
  });
});

test.describe("가구 가림", () => {
  test("O1 책상 뒤에 서면 책상이 캐릭터를 가리고 앞에 서면 가리지 않는다", async ({ page }) => {
    await seedAvatarAgent(page, "rgb(255,0,170)");
    await enterClassroom(page);
    const s = await snap(page);

    await teleportTo(page, { x: DESK_SIDE_X, y: STUDENT_DESK.y - s.footprint.h - 2 });
    await pause(page, 300);
    const behind = await playerShare(page, MAGENTA);

    await teleportTo(page, { x: DESK_SIDE_X, y: STUDENT_DESK.y + STUDENT_DESK.h + 2 });
    await pause(page, 300);
    const front = await playerShare(page, MAGENTA);

    expect(front, "캐릭터가 식별되어야 비교가 의미 있다").toBeGreaterThan(0.2);
    expect(behind).toBeLessThan(front * 0.92);
  });
});

test.describe("조작부와 대화창 겹침", () => {
  test("N1 교실 조작부·안내·상호작용 버튼이 겹치거나 화면을 넘지 않는다", async ({ page }) => {
    await enterClassroom(page);
    const s = await snap(page);
    await teleport(page, s.teacher.x, s.teacher.y + 50);
    await expectNoOverlap(page, {
      "방향패드": page.locator(id("direction-pad")),
      "상호작용 버튼": promptButton(page, /선생님과 이야기하기/),
      "조작 안내": page.getByText("방향키 또는 WASD로 걸어보세요"),
    });
    await expectOnTop(promptButton(page, /선생님과 이야기하기/), "상호작용 버튼");
    await expectOnTop(page.locator(id("dpad-right")), "방향패드");
  });

  test("N2 상담창의 입력·닫기가 가려지지 않고 가로로 넘치지 않는다", async ({ page }) => {
    await seedAgent(page);
    await enterClassroom(page);
    await openTeacher(page);
    const dialog = teacherDialog(page);
    await expectOnTop(page.locator(id("teacher-input")), "상담 입력창");
    await expectOnTop(dialog.getByRole("button", { name: "닫기" }), "닫기 버튼");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    const box = (await dialog.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  });

  test("N3 학습 패널의 닫기와 첫 입력이 가려지지 않고 가로로 넘치지 않는다", async ({ page }) => {
    await seedAgent(page);
    await enterClassroom(page);
    await teleportTo(page, STUDY_SPOT);
    await page.keyboard.press(INTERACT_KEY);
    const dialog = learningDialog(page);
    await expect(dialog).toBeVisible();
    await expectOnTop(dialog.getByRole("button", { name: "닫기" }), "닫기 버튼");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    const box = (await dialog.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  });

  test("N4 만들기 화면의 다음 단계 버튼이 가로로 넘치지 않는다", async ({ page }) => {
    await page.goto(paths.onboarding);
    const next = page.getByRole("button", { name: /다음/ });
    await expect(next).toBeVisible();
    const box = (await next.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });
});
