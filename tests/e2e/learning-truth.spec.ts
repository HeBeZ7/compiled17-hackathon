import { expect, test, type Page } from "@playwright/test";
import { api, id, learningDialog, openLearning, seedAgent } from "./support/app";
import { FREE } from "./support/copy";
import { apiError, artifact, dataset, fail, ok, quote, run, runtime, unknownQuote, validation } from "./support/fixtures";

test.skip(!process.env.AA_QA_E2E, "Not run without the product hook. Run with AA_QA_E2E=1 against the target commit.");
test.describe.configure({ timeout: 60_000 });

// UI display checks with the network replaced through page.route. Not a real provider check.
// Agent saving and the screen flow use the real app.

type Over = Record<string, unknown>;

const pricePanel = (page: Page) => page.locator(id("price-panel"));
const startButton = (page: Page) => page.locator(id("training-start"));
const statusRegion = (page: Page) => page.getByRole("region", { name: "Training status" });
// Details carry negatives such as "do not mean training failed", so a state is judged from the badge only.
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
  await pricePanel(page).getByRole("button", { name: "Check price", exact: true }).click();
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
  await pricePanel(page).getByRole("button", { name: "Check price", exact: true }).click();
  await expect(pricePanel(page)).toContainText("gpu_hour");
  await dialog.getByLabel("Currency (such as USD)").fill("USD");
  await dialog.getByLabel("Run cost limit").fill("10");
  await dialog.getByRole("button", { name: "Check conditions on server" }).click();
  await expect(dialog).toContainText("Conditions passed");
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
  if (opts.terminal) await page.getByRole("region", { name: "My training runs" }).getByRole("button").first().click();
  await expect(page.locator(id("run-status"))).toBeVisible();
}

test.describe("[double] price and training status display", () => {
  test("U1 a failed price lookup is not shown as free and blocks the training request", async ({ page }) => {
    const panel = await openWithQuote(page, (r) => r.fulfill({ status: 502, json: fail("PROVIDER_ERROR") }));
    await expect(panel.locator(id("connection-notice"))).toBeVisible();
    await expect(panel).not.toContainText(FREE);
    await expect(startButton(page)).toBeDisabled();
  });

  test("U2 a null price in a fetch_failed quote shows as unknown and blocks the training request", async ({ page }) => {
    const panel = await openWithQuote(page, (r) => r.fulfill({ json: ok(unknownQuote()) }));
    await expect(panel).toContainText("Unknown · not free");
    await expect(panel).not.toContainText(FREE);
    await expect(startButton(page)).toBeDisabled();
  });

  test("U3 a known price is shown with unit, region and query time", async ({ page }) => {
    const panel = await openWithQuote(page, (r) => r.fulfill({ json: ok(quote()) }));
    for (const text of ["2.5", "USD", "gpu_hour", "fixture-region-1", "2026"]) await expect(panel).toContainText(text);
  });

  test("U4 double-clicking the training request sends one request", async ({ page }) => {
    const agent = await seedAgent(page);
    const counter = await stubLearning(page, agent.agentId);
    await prepareToSubmit(page);
    await startButton(page).dblclick();
    await page.waitForTimeout(800);
    expect(counter.posts).toBe(1);
  });

  test("U5 an unknown status is shown as neither failed nor complete", async ({ page }) => {
    await showRun(page, { status: "status_unknown", providerJobId: null, lastObservedAt: null });
    await expect(statusBadge(page)).toContainText("Status unknown");
    await expect(statusBadge(page)).not.toContainText(/fail|complete/i);
  });

  test("U6 a cancel request is not shown as a confirmed cancel", async ({ page }) => {
    await showRun(page, { status: "cancel_requested" });
    await expect(statusBadge(page)).toContainText("Cancel requested");
    await expect(statusBadge(page)).not.toContainText(/canceled|cancelled|confirmed/i);
  });

  test("U7 a lookup error is shown with the last observed state and not as failure", async ({ page }) => {
    await showRun(page, { status: "running", pollError: apiError("PROVIDER_TIMEOUT") });
    await expect(statusRegion(page)).toContainText(/Could not get the latest status.*last observed state/);
    await expect(statusBadge(page)).toHaveText("Running");
  });

  test("U8 a failed result load is not shown as usable", async ({ page }) => {
    await showRun(
      page,
      { status: "completed", artifactId: "fixture-artifact", trainingCompleted: true },
      { terminal: true, runtime: { state: "load_failed", error: apiError("PROVIDER_ERROR") } },
    );
    const status = page.locator(id("run-status"));
    await expect(status).toContainText("Load failed");
    await expect(status).not.toContainText(/\b(?:usable|ready to use|available to use)\b/i);
  });

  test("U9 completed training alone is not shown as improved performance", async ({ page }) => {
    await showRun(
      page,
      { status: "completed", artifactId: "fixture-artifact", trainingCompleted: true, runtimeReady: true },
      { terminal: true, runtime: { state: "loaded", responseVerifiedAt: "2026-11-09T00:00:00.000Z" } },
    );
    await expect(statusBadge(page)).toHaveText("Training complete");
    const status = page.locator(id("run-status"));
    await expect(status).toContainText("No evaluation");
    // The required disclaimer "does not mean improved performance" is not a defect.
    await expect(status).not.toContainText(/(?<!not mean )\bimproved\b|\bsmarter\b|\bbetter (?:performance|results)\b/i);
  });
});
