import { expect, test, type Page } from "@playwright/test";
import { id, paths, playerShare, snap, solidPng, stubCatalog, waitClassroomReady } from "./support/app";
import { CATALOG_DOUBLE_MODEL } from "./support/fixtures";

test.skip(!process.env.AA_QA_E2E, "제품 hook 통합 전 미실행. 대상 커밋 검증 때 AA_QA_E2E=1로 실행한다.");

// A-04. 외형 반영은 플레이 캔버스의 실제 픽셀로 판정한다.
// 카탈로그 검색만 page.route 대역이다(stubCatalog). 저장·외형 업로드·교실은 실제 경로다.
const MAGENTA: [number, number, number] = [255, 0, 170];
const CYAN: [number, number, number] = [0, 200, 255];
const MODEL = CATALOG_DOUBLE_MODEL;

async function start(page: Page) {
  await page.goto(paths.onboarding);
  await page.locator(id(`model-option-${MODEL}`)).click();
  // 모델 선택과 이름·외형은 별도 단계다.
  await page.getByRole("button", { name: "다음: 이름과 외형" }).click();
  await page.locator(id("agent-name")).fill("검증용 학생");
}

async function drawFill(page: Page) {
  await page.locator(id("avatar-mode-drawing")).click();
  await page.locator(id("avatar-pen-color")).fill("#ff00aa");
  const canvas = page.locator(id("avatar-draw-canvas"));
  const b = (await canvas.boundingBox())!;
  for (let y = 4; y < b.height; y += 8) {
    await page.mouse.move(b.x + 1, b.y + y);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width - 1, b.y + y, { steps: 3 });
    await page.mouse.up();
  }
}

async function uploadPhoto(page: Page, css: string) {
  await page.locator(id("avatar-mode-photo")).click();
  await page.locator(id("avatar-photo-input")).setInputFiles({
    name: "photo.png", mimeType: "image/png", buffer: await solidPng(page, css),
  });
  // 미리보기 틀은 항상 렌더되므로 보이는지가 아니라 선택 상태로 판정한다.
  await expect(page.locator(id("avatar-preview"))).toHaveAttribute("data-selection", "draft");
}

async function confirmAndEnter(page: Page) {
  await page.locator(id("onboarding-confirm")).click();
  // page.goto로 바로 이동하면 저장 요청이 끊길 수 있어 제품의 실제 화면 전환을 기다린다.
  await page.waitForURL(`**${paths.classroom}`);
  await waitClassroomReady(page);
}

test.describe("그림/사진 외형과 선택 모델 연결", () => {
  test.beforeEach(async ({ page }) => { await stubCatalog(page); });

  test("V1 그린 외형이 교실 캐릭터에 보이고 선택 모델과 같은 에이전트다", async ({ page }) => {
    await start(page);
    await drawFill(page);
    await confirmAndEnter(page);
    const s = await snap(page);
    expect(s.agent.selectedModelId).toBe(MODEL);
    expect(s.agent.avatarSource).toBe("drawing");
    expect(await playerShare(page, MAGENTA)).toBeGreaterThan(0.1);
  });

  test("V2 사진 외형이 교실 캐릭터에 보이고 선택 모델과 같은 에이전트다", async ({ page }) => {
    await start(page);
    await uploadPhoto(page, "rgb(0,200,255)");
    await confirmAndEnter(page);
    const s = await snap(page);
    expect(s.agent.selectedModelId).toBe(MODEL);
    expect(s.agent.avatarSource).toBe("photo");
    expect(await playerShare(page, CYAN)).toBeGreaterThan(0.1);
  });

  test("V3 그림을 사진으로 바꿔도 같은 에이전트이고 외형만 교체된다", async ({ page }) => {
    await start(page);
    await drawFill(page);
    await confirmAndEnter(page);
    const first = await snap(page);
    await start(page);
    await uploadPhoto(page, "rgb(0,200,255)");
    await confirmAndEnter(page);
    const second = await snap(page);
    expect(second.agent.agentId).toBe(first.agent.agentId);
    expect(await playerShare(page, CYAN)).toBeGreaterThan(0.1);
    expect(await playerShare(page, MAGENTA)).toBeLessThan(0.02);
  });

  test("V4 새로고침 뒤에도 외형과 모델이 복원된다", async ({ page }) => {
    await start(page);
    await uploadPhoto(page, "rgb(0,200,255)");
    await confirmAndEnter(page);
    await page.reload();
    await page.waitForFunction(() => window.__AA_TEST__?.classroom?.ready() === true);
    expect((await snap(page)).agent.selectedModelId).toBe(MODEL);
    expect(await playerShare(page, CYAN)).toBeGreaterThan(0.1);
  });

  test("V5 해독할 수 없는 이미지는 오류를 보이고 성공 처리하지 않는다", async ({ page }) => {
    await start(page);
    await page.locator(id("avatar-mode-photo")).click();
    await page.locator(id("avatar-photo-input")).setInputFiles({
      name: "broken.png", mimeType: "image/png", buffer: Buffer.from("not an image"),
    });
    await expect(page.locator(id("avatar-error"))).toBeVisible();
    await expect(page.locator(id("avatar-preview"))).not.toHaveAttribute("data-selection", /saved|draft/);
    await expect(page.locator(id("onboarding-confirm"))).toBeDisabled();
  });
});
