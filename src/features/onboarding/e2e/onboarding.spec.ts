import { expect, test, type Page } from "@playwright/test";

/**
 * Everything here runs against the real store and a real browser, except the
 * catalog: E's adapter is not connected on this branch, so catalog responses
 * are TEST DOUBLES injected only by this file. They prove how the screen treats
 * each state. They say nothing about any real model.
 */

const NOW = "2026-11-09T03:00:00.000Z";
const doc = { level: "DOC_REVIEWED", sourceUrl: "https://example.com/doc", checkedAt: NOW, note: "test double" } as const;

function testDoubleEntry(modelId: string, training: "yes" | "no" | "unknown") {
  return {
    ref: {
      source: "test-double",
      publisher: "double-org",
      modelId,
      revision: null,
      licenseRef: null,
      capabilities: {
        listed: { support: "yes", evidence: doc },
        accessible: { support: "unknown", evidence: null },
        filesPreparable: { support: "unknown", evidence: null },
        inference: { support: "no", evidence: doc },
        training: { support: training, evidence: training === "yes" ? doc : null },
        accountVerified: { support: "unknown", evidence: null },
      },
    },
    displayName: `Double ${modelId}`,
    tags: ["text-generation"],
    benchmarks: [],
  };
}

function testDoublePage(items: unknown[], nextCursor: string | null = null, freshness = "live") {
  return { ok: true, data: { items, nextCursor, source: "test-double", freshness, fetchedAt: NOW } };
}

const MODEL_A = "double-org/model-a";
const MODEL_B = "double-org/model-b";

async function useCatalogDouble(page: Page) {
  await page.route("**/api/catalog/models?*", (route) => {
    const url = new URL(route.request().url());
    const q = url.searchParams.get("query") ?? "";
    const cursor = url.searchParams.get("cursor");
    if (q === "nothing") return route.fulfill({ json: testDoublePage([]) });
    if (q === "broken") return route.fulfill({ json: testDoublePage([], null, "fetch_failed") });
    if (cursor === "page-2") return route.fulfill({ json: testDoublePage([testDoubleEntry(MODEL_B, "unknown")]) });
    return route.fulfill({ json: testDoublePage([testDoubleEntry(MODEL_A, "no")], "page-2") });
  });
}

/** Decodes an image the server stored and reports how it is painted. */
function inspectImage(page: Page, url: string) {
  return page.evaluate(async (target) => {
    const response = await fetch(target);
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(bitmap, 0, 0);
    const { data } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    let painted = 0;
    let reddish = 0;
    let bluish = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 128) continue;
      painted++;
      if (data[i] > 200 && data[i + 1] < 90 && data[i + 2] < 90) reddish++;
      if (data[i + 2] > 200 && data[i] < 90 && data[i + 1] < 90) bluish++;
    }
    return { type: blob.type, width: bitmap.width, height: bitmap.height, total: bitmap.width * bitmap.height, painted, reddish, bluish };
  }, url);
}

async function currentAgent(page: Page) {
  const body = await page.evaluate(async () => (await fetch("/api/agents/current")).json());
  return body.data.agent;
}

/** A photo with a red left half and a blue right half, so a crop is visible in the pixels. */
async function makePhoto(page: Page, type: "image/png" | "image/jpeg", width = 800, height = 400): Promise<Buffer> {
  const base64 = await page.evaluate(
    ([w, h, mime]) => {
      const canvas = document.createElement("canvas");
      canvas.width = Number(w);
      canvas.height = Number(h);
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#ff0000";
      ctx.fillRect(0, 0, canvas.width / 2, canvas.height);
      ctx.fillStyle = "#0000ff";
      ctx.fillRect(canvas.width / 2, 0, canvas.width / 2, canvas.height);
      return canvas.toDataURL(String(mime), 0.95).split(",")[1];
    },
    [width, height, type] as const,
  );
  return Buffer.from(base64, "base64");
}

async function drawStroke(page: Page) {
  const canvas = page.getByTestId("avatar-draw-canvas");
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.6, { steps: 6 });
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.4, { steps: 6 });
  await page.mouse.up();
}

async function gotoCharacterStep(page: Page) {
  await page.getByRole("button", { name: /다음: 이름과 외형|모델 없이 다음으로/ }).click();
  await expect(page.getByTestId("agent-name")).toBeVisible();
}

/** The dev server compiles the game engine on the first visit, which can take many seconds. */
async function expectClassroom(page: Page) {
  await expect(page).toHaveURL(/\/classroom$/, { timeout: 40_000 });
}

async function expectNoSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

test.beforeEach(async ({ page }) => {
  page.on("pageerror", (error) => {
    throw error;
  });
});

test("catalog: search, paging, empty, failure and per-stage support", async ({ page }) => {
  await useCatalogDouble(page);
  await page.goto("/create");

  const card = page.locator(`[data-model-id="${MODEL_A}"]`);
  await expect(card).toBeVisible();
  await expect(card.locator('[data-capability="training"]')).toHaveAttribute("data-support", "no");
  await expect(card.locator('[data-capability="training"]')).toContainText("불가");
  await expect(card.locator('[data-capability="inference"]')).toContainText("불가");
  await expect(card.locator('[data-capability="accessible"]')).toContainText("미확인");
  await expect(card).toContainText("벤치마크 근거 없음");
  await expect(card).toContainText("미확인");
  await expect(page.getByTestId("catalog-provenance")).toContainText("실시간 조회");

  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(page.locator(`[data-model-id="${MODEL_B}"]`)).toBeVisible();
  await expect(page.getByText("2쪽")).toBeVisible();
  await page.getByRole("button", { name: "이전" }).click();
  await expect(card).toBeVisible();

  await page.getByRole("searchbox").fill("nothing");
  await expect(page.getByTestId("catalog-empty")).toContainText("nothing");

  // A failed lookup must not read as "no such model".
  await page.getByRole("searchbox").fill("broken");
  await expect(page.getByTestId("connection-notice")).toBeVisible();
  await expect(page.getByTestId("catalog-empty")).toBeHidden();
  await expectNoSidewaysScroll(page);
});

test("catalog: an unconnected service says so and offers no invented models", async ({ page }) => {
  await page.goto("/create");
  await expect(page.getByTestId("connection-notice")).toHaveAttribute("data-code", "NOT_CONNECTED");
  await expect(page.locator("[data-model-id]")).toHaveCount(0);
});

test("a drawing and the selected model are saved as one agent and restored", async ({ page, context }) => {
  await useCatalogDouble(page);
  await page.goto("/create");

  await page.getByTestId(`model-option-${MODEL_A}`).click();
  await expect(page.getByTestId("selected-model")).toContainText(MODEL_A);
  await gotoCharacterStep(page);

  const confirm = page.getByTestId("onboarding-confirm");
  await expect(confirm).toBeDisabled();

  await page.getByTestId("agent-name").fill("초코");
  await page.getByTestId("avatar-pen-color").fill("#ff0000");
  await drawStroke(page);
  await expect(page.getByTestId("avatar-preview")).toHaveAttribute("data-selection", "draft");
  await expectNoSidewaysScroll(page);

  await confirm.click();
  await expectClassroom(page);

  const agent = await currentAgent(page);
  expect(agent.name).toBe("초코");
  expect(agent.selectedModel.modelId).toBe(MODEL_A);
  expect(agent.avatar.inputKind).toBe("drawing");

  const render = await inspectImage(page, agent.avatar.renderUrl);
  expect(render).toMatchObject({ type: "image/png", width: 256, height: 256 });
  expect(render.reddish).toBeGreaterThan(200);
  expect(render.painted).toBeLessThan(render.total);
  const original = await inspectImage(page, agent.avatar.originalUrl);
  expect(original).toMatchObject({ type: "image/png", width: 512, height: 512 });
  expect(original.reddish).toBeGreaterThan(200);

  // Fresh page with the same browser identity: everything comes back from the store.
  const reentry = await context.newPage();
  await reentry.goto("/create");
  await expect(reentry.getByTestId("selected-model")).toContainText(MODEL_A);
  await expect(reentry.getByTestId("selected-model")).toContainText("저장할 때의 정보");
  await gotoCharacterStep(reentry);
  await expect(reentry.getByTestId("agent-name")).toHaveValue("초코");
  await expect(reentry.getByTestId("avatar-preview")).toHaveAttribute("data-selection", "saved");

  // Re-saving without touching the appearance keeps the same asset.
  await reentry.getByTestId("onboarding-confirm").click();
  await expectClassroom(reentry);
  const resaved = await currentAgent(reentry);
  expect(resaved.avatar.assetId).toBe(agent.avatar.assetId);
  expect(resaved.version).toBe(agent.version + 1);
  await reentry.close();
});

test("a photo is saved, cropped and restored, and bad files are refused", async ({ page }) => {
  await page.goto("/create");
  await gotoCharacterStep(page);
  await page.getByTestId("avatar-mode-photo").click();
  const input = page.getByTestId("avatar-photo-input");
  const problem = page.getByTestId("avatar-error");

  await input.setInputFiles({ name: "note.png", mimeType: "image/png", buffer: Buffer.from("this is not an image at all") });
  await expect(problem).toContainText("PNG, JPEG, WebP");

  // Right signature, unreadable body.
  const corrupt = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 7)]);
  await input.setInputFiles({ name: "broken.png", mimeType: "image/png", buffer: corrupt });
  await expect(problem).toContainText("읽지 못했습니다");

  await input.setInputFiles({ name: "big.png", mimeType: "image/png", buffer: Buffer.concat([corrupt, Buffer.alloc(8 * 1024 * 1024)]) });
  await expect(problem).toContainText("8MB");

  const photo = await makePhoto(page, "image/jpeg");
  await input.setInputFiles({ name: "me.jpg", mimeType: "image/jpeg", buffer: photo });
  await expect(problem).toBeHidden();
  await expect(page.getByTestId("avatar-preview")).toHaveAttribute("data-selection", "draft");

  // Dragging the view right reveals the photo's left side, which is red.
  const view = page.getByTestId("photo-crop-view");
  await view.scrollIntoViewIfNeeded();
  const box = (await view.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.9, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByTestId("avatar-preview")).toHaveAttribute("data-selection", "draft");

  await page.getByTestId("agent-name").fill("사진이");
  await expectNoSidewaysScroll(page);
  await page.getByTestId("onboarding-confirm").click();
  await expectClassroom(page);

  const agent = await currentAgent(page);
  expect(agent.selectedModel).toBeNull();
  expect(agent.avatar.inputKind).toBe("photo");

  const render = await inspectImage(page, agent.avatar.renderUrl);
  expect(render).toMatchObject({ type: "image/png", width: 256, height: 256 });
  expect(render.reddish).toBeGreaterThan(render.total * 0.5);
  expect(render.bluish).toBeLessThan(render.reddish / 2);

  // The original keeps the file as provided, uncropped.
  const original = await inspectImage(page, agent.avatar.originalUrl);
  expect(original).toMatchObject({ type: "image/jpeg", width: 800, height: 400 });
  expect(original.bluish).toBeGreaterThan(original.total * 0.4);

  await page.goto("/create");
  await gotoCharacterStep(page);
  await expect(page.getByTestId("agent-name")).toHaveValue("사진이");
  await expect(page.getByTestId("avatar-preview")).toHaveAttribute("data-selection", "saved");
  await expect(page.getByTestId("photo-crop-view")).toBeVisible();
});

test("switching input keeps each editor's work, and an erased drawing cannot be saved", async ({ page }) => {
  await page.goto("/create");
  await gotoCharacterStep(page);
  await page.getByTestId("agent-name").fill("지우개");
  const confirm = page.getByTestId("onboarding-confirm");
  const preview = page.getByTestId("avatar-preview");

  await drawStroke(page);
  await expect(preview).toHaveAttribute("data-selection", "draft");

  await page.getByTestId("avatar-mode-photo").click();
  await expect(preview).toHaveAttribute("data-selection", "none");
  await expect(confirm).toBeDisabled();

  await page.getByTestId("avatar-mode-drawing").click();
  await expect(preview).toHaveAttribute("data-selection", "draft");

  await page.getByRole("button", { name: "모두 지우기" }).click();
  await expect(preview).toHaveAttribute("data-selection", "none");
  await expect(confirm).toBeDisabled();

  await page.getByRole("button", { name: "되돌리기" }).click();
  await expect(preview).toHaveAttribute("data-selection", "draft");
  await expect(confirm).toBeEnabled();
});

test("a concurrent change is reported instead of being overwritten silently", async ({ page }) => {
  await page.goto("/create");
  await gotoCharacterStep(page);
  await page.getByTestId("agent-name").fill("먼저");
  await drawStroke(page);
  await expect(page.getByTestId("avatar-preview")).toHaveAttribute("data-selection", "draft");

  // Another tab saves first.
  await page.evaluate(async () => {
    const original = await (await fetch("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=")).blob();
    const form = new FormData();
    form.set("inputKind", "drawing");
    form.set("original", original, "a.png");
    form.set("render", original, "b.png");
    const asset = (await (await fetch("/api/avatars", { method: "POST", body: form })).json()).data;
    const current = (await (await fetch("/api/agents/current")).json()).data.agent;
    await fetch("/api/agents/current", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "다른 탭", selectedModel: null, avatarAssetId: asset.assetId, expectedVersion: current?.version ?? null }),
    });
  });

  await page.getByTestId("onboarding-confirm").click();
  await expect(page.locator('[data-testid="connection-notice"][data-code="CONFLICT"]')).toBeVisible();
  expect((await currentAgent(page)).name).toBe("다른 탭");

  await page.getByRole("button", { name: "지금 화면의 내용으로 덮어쓰기" }).click();
  await expectClassroom(page);
  expect((await currentAgent(page)).name).toBe("먼저");
});
