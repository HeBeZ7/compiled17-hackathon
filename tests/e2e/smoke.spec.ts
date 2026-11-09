import { expect, test } from "@playwright/test";

// Foundation smoke only: the screens connect and unwired services say so.
// F owns this directory and extends it against PRODUCT_SPEC §7.

test("intro → create → classroom, with unwired services reported as not connected", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("/");
  await page.getByRole("link", { name: /입장/ }).first().click();

  await expect(page).toHaveURL(/\/create$/);
  await expect(page.getByTestId("connection-notice")).toBeVisible();

  await page.getByRole("link", { name: "에이전트 없이 교실 보기" }).click();
  await expect(page).toHaveURL(/\/classroom$/);
  await expect(page.locator("canvas")).toBeVisible({ timeout: 20_000 });

  await page.getByRole("button", { name: "선생님에게 말 걸기" }).click();
  await expect(page.getByRole("dialog", { name: "선생님 상담" })).toBeVisible();
  await page.getByRole("button", { name: "닫기" }).click();
  await expect(page.getByRole("dialog", { name: "선생님 상담" })).toBeHidden();

  expect(errors).toEqual([]);
});

test("the page does not scroll sideways", async ({ page }) => {
  for (const path of ["/", "/create", "/classroom"]) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});

test("api reports unwired providers as 503 NOT_CONNECTED and never as success", async ({ request }) => {
  const response = await request.get("/api/catalog/models?query=x");
  expect(response.status()).toBe(503);
  const body = await response.json();
  expect(body.ok).toBe(false);
  expect(body.error.code).toBe("NOT_CONNECTED");
});

test("agent and avatar persist through the real store", async ({ request }) => {
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
    "base64",
  );
  const file = { name: "a.png", mimeType: "image/png", buffer: png };
  const upload = await request.post("/api/avatars", { multipart: { inputKind: "drawing", original: file, render: file } });
  expect(upload.status()).toBe(200);
  const asset = (await upload.json()).data;

  const save = await request.put("/api/agents/current", {
    data: { name: "초코", selectedModel: null, avatarAssetId: asset.assetId, expectedVersion: null },
  });
  expect(save.status()).toBe(200);
  expect((await save.json()).data.version).toBe(1);

  const current = await (await request.get("/api/agents/current")).json();
  expect(current.data.agent.name).toBe("초코");

  const image = await request.get(asset.renderUrl);
  expect(image.headers()["content-type"]).toBe("image/png");
  expect(Buffer.compare(await image.body(), png)).toBe(0);

  const stale = await request.put("/api/agents/current", {
    data: { name: "다른 이름", selectedModel: null, avatarAssetId: null, expectedVersion: null },
  });
  expect(stale.status()).toBe(409);

  const notImage = await request.post("/api/avatars", {
    multipart: {
      inputKind: "photo",
      original: { name: "x.png", mimeType: "image/png", buffer: Buffer.from("not an image") },
      render: file,
    },
  });
  expect(notImage.status()).toBe(400);
});
