import { expect, test, type Page } from "@playwright/test";
import {
  characterCard,
  classroomRoot,
  currentAgent,
  enterClassroom,
  framePng,
  hueBounds,
  hueShare,
  id,
  imagePixels,
  myAgentPill,
  openCatalogList,
  openCharacterCard,
  paths,
  seedAgent,
  seedAvatarAgent,
  snap,
  solidPng,
  stubCatalog,
  waitClassroomReady,
  type Hue,
} from "./support/app";
import { CATALOG_DOUBLE_MODEL } from "./support/fixtures";

test.skip(!process.env.AA_QA_E2E, "Not run without the product hook. Run with AA_QA_E2E=1 against the target commit.");
test.describe.configure({ timeout: 90_000 });

// A-04, R-027. First person has no player body, so appearance is judged on the three real surfaces: the My agent pill,
// the My character card and the picture frame on the desk. Every surface is judged by decoded image or rendered pixels.
// Only the catalog search is a double (stubCatalog). Save, avatar upload and the classroom are real paths.
const MODEL = CATALOG_DOUBLE_MODEL;
const PHOTO_CSS = "rgb(0,200,255)";
/** A surface shows the avatar when its image is mostly this hue, and an old avatar when it is not. */
const MIN_IMAGE_SHARE = 0.3;
const MAX_OTHER_SHARE = 0.02;
const MIN_FRAME_SHARE = 0.05;

async function start(page: Page) {
  await openCatalogList(page, MODEL);
  await page.locator(id(`model-option-${MODEL}`)).click();
  await page.getByRole("button", { name: "Next: name and appearance" }).click();
  await page.locator(id("agent-name")).fill("Test student");
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
  // The preview frame always renders, so it is judged by selection state rather than visibility.
  await expect(page.locator(id("avatar-preview"))).toHaveAttribute("data-selection", "draft");
}

async function confirmAndEnter(page: Page) {
  await page.locator(id("onboarding-confirm")).click();
  // Going straight to the URL could cut off the save, so the product's own navigation is awaited.
  await page.waitForURL(`**${paths.classroom}`);
  await waitClassroomReady(page);
}

const other = (hue: Hue): Hue => (hue === "magenta" ? "cyan" : "magenta");

/** One real image element shows the stored render, decoded to a real size, with the right pixels. */
async function expectImage(page: Page, name: string, image: ReturnType<Page["locator"]>, hue: Hue, renderUrl: string) {
  await expect(image, `${name} must show an image, not a placeholder`).toBeVisible();
  await expect.poll(() => image.evaluate((el) => (el as HTMLImageElement).complete), { message: `${name} never finished loading` }).toBe(true);
  const pixels = await imagePixels(image, hue);
  expect(pixels.naturalWidth, `${name} failed to decode`).toBeGreaterThan(16);
  expect(pixels.naturalHeight, `${name} failed to decode`).toBeGreaterThan(16);
  expect(pixels.src, `${name} must use the saved render`).toBe(new URL(renderUrl, "http://x").pathname);
  expect(pixels.share, `${name} does not show the user's picture`).toBeGreaterThan(MIN_IMAGE_SHARE);
  expect((await imagePixels(image, other(hue))).share, `${name} shows the previous picture`).toBeLessThan(MAX_OTHER_SHARE);
}

/** The picture frame is a 3D object in the room, so it is judged from the rendered canvas. */
async function expectFrame(page: Page, hue: Hue, attach?: (png: Buffer) => Promise<void>) {
  await expect(classroomRoot(page)).toHaveAttribute("data-avatar-frame", "loaded");
  expect((await snap(page)).avatarFrame).toBe("loaded");
  const png = await framePng(page);
  await attach?.(png);
  expect(await hueShare(page, png, hue), "the desk picture frame does not show the user's picture").toBeGreaterThan(MIN_FRAME_SHARE);
  expect(await hueShare(page, png, other(hue)), "the desk picture frame shows the previous picture").toBeLessThan(MAX_OTHER_SHARE);
}

/** Checks every surface against what the server actually saved. */
async function expectAppearance(page: Page, kind: "drawing" | "photo", hue: Hue, attach?: (png: Buffer) => Promise<void>) {
  const agent = await currentAgent(page);
  expect(agent?.selectedModel?.modelId).toBe(MODEL);
  expect(agent?.avatar?.inputKind).toBe(kind);
  const renderUrl = agent!.avatar!.renderUrl;

  await expect(myAgentPill(page)).toContainText("Test student");
  await expectImage(page, "My agent pill", myAgentPill(page).locator("img"), hue, renderUrl);
  await openCharacterCard(page);
  await expectImage(page, "My character card", characterCard(page).locator("img"), hue, renderUrl);
  await expect(page.locator(id("classroom-character-model"))).toHaveText(MODEL);
  await expectFrame(page, hue, attach);
  return agent!;
}

test.describe("drawn and photo appearance linked to the selected model", () => {
  test.beforeEach(async ({ page }) => { await stubCatalog(page); });

  test("V1 a drawing appears on all three surfaces of the same agent as the model", async ({ page }, testInfo) => {
    await start(page);
    await drawFill(page);
    await confirmAndEnter(page);
    await expectAppearance(page, "drawing", "magenta", (body) => testInfo.attach("frame-drawing", { body, contentType: "image/png" }));
  });

  test("V2 a photo appears on all three surfaces of the same agent as the model", async ({ page }, testInfo) => {
    await start(page);
    await uploadPhoto(page, PHOTO_CSS);
    await confirmAndEnter(page);
    await expectAppearance(page, "photo", "cyan", (body) => testInfo.attach("frame-photo", { body, contentType: "image/png" }));
  });

  test("V3 replacing a drawing with a photo keeps the agent and changes every surface", async ({ page }) => {
    await start(page);
    await drawFill(page);
    await confirmAndEnter(page);
    const first = await expectAppearance(page, "drawing", "magenta");

    await start(page);
    await uploadPhoto(page, PHOTO_CSS);
    await confirmAndEnter(page);
    const second = await expectAppearance(page, "photo", "cyan");
    expect(second.agentId).toBe(first.agentId);
    expect(second.version).toBeGreaterThan(first.version);
  });

  test("V4 appearance and model persist through a reload", async ({ page }) => {
    await start(page);
    await uploadPhoto(page, PHOTO_CSS);
    await confirmAndEnter(page);
    await page.reload();
    await waitClassroomReady(page);
    await expectAppearance(page, "photo", "cyan");
  });

  test("V5 an undecodable image shows an error and does not succeed", async ({ page }) => {
    await start(page);
    await page.locator(id("avatar-mode-photo")).click();
    await page.locator(id("avatar-photo-input")).setInputFiles({
      name: "broken.png", mimeType: "image/png", buffer: Buffer.from("not an image"),
    });
    await expect(page.locator(id("avatar-error"))).toBeVisible();
    await expect(page.locator(id("avatar-preview"))).not.toHaveAttribute("data-selection", /saved|draft/);
    await expect(page.locator(id("onboarding-confirm"))).toBeDisabled();
  });

  test("V6 a photo from the real input is not cropped at the sides", async ({ page }, testInfo) => {
    await start(page);
    await uploadPhoto(page, PHOTO_CSS);
    await confirmAndEnter(page);
    await openCharacterCard(page);

    // The render is a circle, so a side crop makes it narrower than tall.
    const card = characterCard(page).locator("img");
    const cardPng = await card.screenshot();
    await testInfo.attach("photo-in-card", { body: cardPng, contentType: "image/png" });
    const inCard = await hueBounds(page, cardPng, "cyan");
    expect(inCard.height, "the photo must be visible for the ratio to mean anything").toBeGreaterThan(30);
    expect(inCard.width / inCard.height).toBeGreaterThan(0.96);
    expect(inCard.width / inCard.height).toBeLessThan(1.04);

    // Perspective foreshortens the frame, so its tolerance is wider. A crop of half the image still fails here.
    const framePicture = await hueBounds(page, await framePng(page), "cyan");
    expect(framePicture.height).toBeGreaterThan(30);
    expect(framePicture.width / framePicture.height).toBeGreaterThan(0.7);
    expect(framePicture.width / framePicture.height).toBeLessThan(1.3);
  });

  test("V7 an agent without an avatar gets no stand-in picture or default mascot", async ({ page }) => {
    await seedAgent(page);
    await enterClassroom(page);
    await expect(myAgentPill(page)).toContainText("Test student");
    await expect(myAgentPill(page).locator("img")).toHaveCount(0);
    await openCharacterCard(page);
    await expect(characterCard(page).locator("img")).toHaveCount(0);
    await expect(classroomRoot(page)).toHaveAttribute("data-avatar-frame", "none");
    expect((await snap(page)).avatarFrame).toBe("none");
    const png = await framePng(page);
    expect(await hueShare(page, png, "magenta")).toBeLessThan(MAX_OTHER_SHARE);
    expect(await hueShare(page, png, "cyan")).toBeLessThan(MAX_OTHER_SHARE);
  });

  test("V8 a seeded avatar reaches the frame without going through the onboarding screen", async ({ page }) => {
    await seedAvatarAgent(page, "rgb(255,0,170)");
    await enterClassroom(page);
    await expectFrame(page, "magenta");
  });
});
