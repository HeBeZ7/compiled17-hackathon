import { expect, test, type Page } from "@playwright/test";
import { api, id, paths } from "./support/app";
import { apiError, fail, ok, quote, run, runtime, unknownQuote } from "./support/fixtures";

test.skip(!process.env.AA_QA_E2E, "제품 hook 통합 전 미실행. 대상 커밋 검증 때 AA_QA_E2E=1로 실행한다.");

// 네트워크를 page.route로 대체한 UI 표시 검증이다. 실제 공급자 검증이 아니다.
const FREE = /무료|₩\s*0(?![\d.,])|\$\s*0(?:\.0+)?(?![\d.,])/;

const stubQuote = (page: Page) => page.route(api.quote, (r) => r.fulfill({ json: ok(quote()) }));

async function showRun(page: Page, over: Record<string, unknown>, runtimeOver?: Record<string, unknown>) {
  await stubQuote(page);
  await page.route(api.training, (r) => r.fulfill({ json: ok(run(over)) }));
  if (runtimeOver) await page.route(api.runtime, (r) => r.fulfill({ json: ok(runtime(runtimeOver)) }));
  await page.goto(`${paths.learning}?run=fixture-run`);
  return page.locator(id("run-status"));
}

test.describe("[대역] 가격과 학습 상태 표시", () => {
  test("U1 가격 조회 실패 응답을 무료로 표시하지 않는다", async ({ page }) => {
    await page.route(api.quote, (r) => r.fulfill({ status: 502, json: fail("PROVIDER_ERROR", "가격 조회 실패(대역)") }));
    await page.goto(paths.learning);
    const panel = page.locator(id("price-panel"));
    await expect(panel).toContainText(/미확인|조회 실패/);
    await expect(panel).not.toContainText(FREE);
  });

  test("U2 fetch_failed 견적의 null 단가는 미확인으로 표시한다", async ({ page }) => {
    await page.route(api.quote, (r) => r.fulfill({ json: ok(unknownQuote()) }));
    await page.goto(paths.learning);
    const panel = page.locator(id("price-panel"));
    await expect(panel).toContainText("미확인");
    await expect(panel).not.toContainText(FREE);
  });

  test("U3 정상 가격은 단위·지역·조회 시각과 함께 보인다", async ({ page }) => {
    await stubQuote(page);
    await page.goto(paths.learning);
    const panel = page.locator(id("price-panel"));
    for (const text of ["2.5", "USD", "gpu_hour", "fixture-region-1", "2026"]) await expect(panel).toContainText(text);
  });

  test("U4 학습 시작을 연달아 눌러도 요청은 한 번이다", async ({ page }) => {
    await stubQuote(page);
    let posts = 0;
    await page.route(api.training, async (r) => {
      if (r.request().method() === "POST") {
        posts++;
        await new Promise((d) => setTimeout(d, 300));
      }
      await r.fulfill({ json: ok(run({ status: "queued" })) });
    });
    await page.goto(paths.learning);
    await page.locator(id("training-start")).dblclick();
    await page.waitForTimeout(800);
    expect(posts).toBe(1);
  });

  test("U5 상태 불명은 실패나 완료로 표시하지 않는다", async ({ page }) => {
    const status = await showRun(page, { status: "status_unknown", providerJobId: null, lastObservedAt: null });
    await expect(status).toContainText(/상태 불명|확인 중/);
    await expect(status).not.toContainText(/실패|완료/);
  });

  test("U6 취소 요청은 취소 완료로 표시하지 않는다", async ({ page }) => {
    const status = await showRun(page, { status: "cancel_requested" });
    await expect(status).toContainText(/취소 요청/);
    await expect(status).not.toContainText(/취소됨|취소 완료/);
  });

  test("U7 조회 오류는 마지막 관측 상태와 함께 보이고 실패로 표시하지 않는다", async ({ page }) => {
    const status = await showRun(page, { status: "running", pollError: apiError("PROVIDER_TIMEOUT", "조회 시간 초과(대역)") });
    await expect(status).toContainText(/조회/);
    await expect(status).not.toContainText("학습 실패");
  });

  test("U8 결과 로드 실패는 사용 가능으로 표시하지 않는다", async ({ page }) => {
    const status = await showRun(
      page,
      { status: "completed", artifactId: "fixture-artifact", trainingCompleted: true },
      { state: "load_failed", error: apiError("PROVIDER_ERROR", "로드 실패(대역)") },
    );
    await expect(status).toContainText(/로드 실패/);
    await expect(status).not.toContainText("사용 가능");
  });

  test("U9 학습 완료만으로 성능 향상을 표시하지 않는다", async ({ page }) => {
    const status = await showRun(
      page,
      { status: "completed", artifactId: "fixture-artifact", trainingCompleted: true, runtimeReady: true },
      { state: "loaded", responseVerifiedAt: "2026-11-09T00:00:00.000Z" },
    );
    await expect(status).toContainText("완료");
    await expect(status).not.toContainText(/향상|더 똑똑|성능이 좋아/);
  });
});
