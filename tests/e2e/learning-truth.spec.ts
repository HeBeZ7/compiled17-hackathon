import { expect, test, type Page } from "@playwright/test";
import { api, id, learningDialog, openLearning, seedAgent } from "./support/app";
import { apiError, artifact, dataset, fail, ok, quote, run, runtime, unknownQuote, validation } from "./support/fixtures";

test.skip(!process.env.AA_QA_E2E, "제품 hook 통합 전 미실행. 대상 커밋 검증 때 AA_QA_E2E=1로 실행한다.");

// 네트워크를 page.route로 대체한 UI 표시 검증이다. 실제 공급자 검증이 아니다.
// 에이전트 저장과 화면 흐름은 실제 앱을 쓴다.
const FREE = /무료(?!라는 뜻이 아|가 아)|₩\s*0(?![\d.,])|\$\s*0(?:\.0+)?(?![\d.,])/;

type Over = Record<string, unknown>;

const pricePanel = (page: Page) => page.locator(id("price-panel"));
const startButton = (page: Page) => page.locator(id("training-start"));
const statusRegion = (page: Page) => page.getByRole("region", { name: "학습 상태" });
// 상세 설명에는 "실패로 단정하지 않으며" 같은 부정 표현이 있어 상태 판정은 배지로만 한다.
const statusBadge = (page: Page) => statusRegion(page).locator('span[class*="badge"]').first();

/** posts로 학습 생성 요청 수를 돌려준다. */
async function stubLearning(page: Page, agentId: string, runs: unknown[] = []) {
  const counter = { posts: 0 };
  await page.route(api.training, async (r) => {
    const path = new URL(r.request().url()).pathname;
    if (r.request().method() === "POST") {
      counter.posts++;
      await new Promise((d) => setTimeout(d, 300));
      return r.fulfill({ json: ok(run({ status: "queued" }, agentId)) });
    }
    return r.fulfill({ json: path.endsWith("/runs") ? ok({ runs }) : ok(runs[0]) });
  });
  return counter;
}

async function openWithQuote(page: Page, respond: Parameters<Page["route"]>[1]) {
  const agent = await seedAgent(page);
  await stubLearning(page, agent.agentId);
  await page.route(api.quote, respond);
  await openLearning(page);
  await pricePanel(page).getByRole("button", { name: "가격 조회" }).click();
  return pricePanel(page);
}

async function prepareToSubmit(page: Page) {
  const dialog = learningDialog(page);
  await page.route(api.datasets, (r) => r.fulfill({ json: ok(dataset()) }));
  await page.route(api.validate, (r) => r.fulfill({ json: ok(validation()) }));
  await page.route(api.quote, (r) => r.fulfill({ json: ok(quote()) }));
  await openLearning(page);
  await dialog.locator('input[type="file"]').setInputFiles({
    name: "data.jsonl", mimeType: "application/jsonl", buffer: Buffer.from('{"messages":[]}\n'),
  });
  await dialog.locator("select").selectOption("lora");
  await pricePanel(page).getByRole("button", { name: "가격 조회" }).click();
  await expect(pricePanel(page)).toContainText("gpu_hour");
  await dialog.getByLabel("통화 (예: USD)").fill("USD");
  await dialog.getByLabel("실행 비용 한도").fill("10");
  await dialog.getByRole("button", { name: "서버에서 조건 확인" }).click();
  await expect(dialog).toContainText("조건 통과");
  await dialog.getByRole("checkbox").check();
  await expect(startButton(page)).toBeEnabled();
}

async function showRun(page: Page, over: Over, opts: { terminal?: boolean; runtime?: Over } = {}) {
  const agent = await seedAgent(page);
  await stubLearning(page, agent.agentId, [run(over, agent.agentId)]);
  await page.route(api.quote, (r) => r.fulfill({ json: ok(quote()) }));
  if (opts.runtime) {
    await page.route(api.artifact, (r) => r.fulfill({ json: ok(artifact()) }));
    await page.route(api.runtime, (r) => r.fulfill({ json: ok(runtime(opts.runtime)) }));
  }
  await openLearning(page);
  if (opts.terminal) await page.getByRole("region", { name: "내 학습 기록" }).getByRole("button").first().click();
  await expect(page.locator(id("run-status"))).toBeVisible();
}

test.describe("[대역] 가격과 학습 상태 표시", () => {
  test("U1 가격 조회 실패 응답을 무료로 표시하지 않고 학습 요청을 막는다", async ({ page }) => {
    const panel = await openWithQuote(page, (r) => r.fulfill({ status: 502, json: fail("PROVIDER_ERROR") }));
    await expect(panel.locator(id("connection-notice"))).toBeVisible();
    await expect(panel).not.toContainText(FREE);
    await expect(startButton(page)).toBeDisabled();
  });

  test("U2 fetch_failed 견적의 null 단가는 미확인으로 표시하고 학습 요청을 막는다", async ({ page }) => {
    const panel = await openWithQuote(page, (r) => r.fulfill({ json: ok(unknownQuote()) }));
    await expect(panel).toContainText("미확인");
    await expect(panel).not.toContainText(FREE);
    await expect(startButton(page)).toBeDisabled();
  });

  test("U3 정상 가격은 단위·지역·조회 시각과 함께 보인다", async ({ page }) => {
    const panel = await openWithQuote(page, (r) => r.fulfill({ json: ok(quote()) }));
    for (const text of ["2.5", "USD", "gpu_hour", "fixture-region-1", "2026"]) await expect(panel).toContainText(text);
  });

  test("U4 학습 시작을 연달아 눌러도 요청은 한 번이다", async ({ page }) => {
    const agent = await seedAgent(page);
    const counter = await stubLearning(page, agent.agentId);
    await prepareToSubmit(page);
    await startButton(page).dblclick();
    await page.waitForTimeout(800);
    expect(counter.posts).toBe(1);
  });

  test("U5 상태 불명은 실패나 완료로 표시하지 않는다", async ({ page }) => {
    await showRun(page, { status: "status_unknown", providerJobId: null, lastObservedAt: null });
    await expect(statusBadge(page)).toContainText(/상태 불명|확인 중/);
    await expect(statusBadge(page)).not.toContainText(/실패|완료/);
  });

  test("U6 취소 요청은 취소 완료로 표시하지 않는다", async ({ page }) => {
    await showRun(page, { status: "cancel_requested" });
    await expect(statusBadge(page)).toContainText(/취소 요청/);
    await expect(statusBadge(page)).not.toContainText(/취소됨|취소 완료|취소 확인/);
  });

  test("U7 조회 오류는 마지막 관측 상태와 함께 보이고 실패로 표시하지 않는다", async ({ page }) => {
    await showRun(page, { status: "running", pollError: apiError("PROVIDER_TIMEOUT") });
    await expect(statusRegion(page)).toContainText(/최신 상태|조회/);
    await expect(statusBadge(page)).toContainText("실행 중");
    await expect(statusBadge(page)).not.toContainText("실패");
  });

  test("U8 결과 로드 실패는 사용 가능으로 표시하지 않는다", async ({ page }) => {
    await showRun(
      page,
      { status: "completed", artifactId: "fixture-artifact", trainingCompleted: true },
      { terminal: true, runtime: { state: "load_failed", error: apiError("PROVIDER_ERROR") } },
    );
    const status = page.locator(id("run-status"));
    await expect(status).toContainText("로드 실패");
    await expect(status).not.toContainText(/사용 가능(?! 여부)/);
  });

  test("U9 학습 완료만으로 성능 향상을 표시하지 않는다", async ({ page }) => {
    await showRun(
      page,
      { status: "completed", artifactId: "fixture-artifact", trainingCompleted: true, runtimeReady: true },
      { terminal: true, runtime: { state: "loaded", responseVerifiedAt: "2026-11-09T00:00:00.000Z" } },
    );
    await expect(statusBadge(page)).toContainText("완료");
    const status = page.locator(id("run-status"));
    await expect(status).toContainText("평가 없음");
    // "성능 향상을 뜻하지는 않습니다" 같은 올바른 고지는 결함이 아니다.
    await expect(status).not.toContainText(/향상(?!을 뜻하지|을 판단할 수)|더 똑똑|성능이 좋아/);
  });
});
