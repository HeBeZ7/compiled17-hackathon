import { expect, type Locator, type Page } from "@playwright/test";
import { INTERACTIONS, LEARNING_DESK, ROOM, STUDENT_DESKS, TEACHER } from "../../../src/shared/world/layout";
import { copyViolations } from "./copy";
import { baseModel, catalogPage, ok } from "./fixtures";

// Single place where specs meet the product UI. Geometry comes from layout.ts, the source every mesh and collider reads.
export const paths = { landing: "/", classroom: "/classroom", onboarding: "/create" };
export const api = {
  quote: "**/api/pricing/quotes",
  training: "**/api/training/runs**",
  runtime: "**/api/artifacts/*/runtime",
  artifact: "**/api/artifacts/*",
  datasets: "**/api/training/datasets",
  validate: "**/api/training/validate",
  catalogSearch: "**/api/catalog/models**",
};
export const INTERACT_KEY = "KeyE";
export const id = (name: string) => `[data-testid="${name}"]`;

export interface Vec { x: number; z: number }
export interface Pose extends Vec { yaw: number }
export type ClassroomTargetId = "teacher" | "study_spot";

export interface Snapshot {
  position: Vec;
  yaw: number;
  pitch: number;
  moving: boolean;
  paused: boolean;
  pointerLocked: boolean;
  target: ClassroomTargetId | null;
  world: { ROOM: typeof ROOM };
  colliders: {
    boxes: readonly { x: number; z: number; w: number; d: number }[];
    circles: readonly { x: number; z: number; r: number }[];
  };
  /** Status of the picture frame on the desk. B exposes status only, not the texture source. */
  avatarFrame?: "none" | "loading" | "loaded" | "failed";
}

interface ClassroomTestHook {
  ready(): boolean;
  snapshot(): Snapshot;
  teleport(x: number, z: number, yaw?: number): void;
  setLook(yaw: number, pitch: number): void;
  remount(): void;
}

declare global {
  interface Window { __AA_TEST__?: { classroom?: ClassroomTestHook } }
}

/** Yaw 0 faces -z (the board), positive yaw turns left, matching three.js. */
export const forwardOf = (yaw: number): Vec => ({ x: -Math.sin(yaw), z: -Math.cos(yaw) });
export const rightOf = (yaw: number): Vec => ({ x: Math.cos(yaw), z: -Math.sin(yaw) });
export const yawFacing = (from: Vec, to: Vec) => Math.atan2(-(to.x - from.x), -(to.z - from.z));
export const distance = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.z - b.z);

/** Start of the centre aisle, 8 m of free floor along -z. A defect that speeds the player up still stays in the clear. */
export const AISLE: Pose = { x: 0, z: 5, yaw: 0 };
/** Open floor with at least 0.7 m free in every direction. */
export const OPEN_FLOOR: Vec = { x: 0, z: 2.4 };
export const TEACHER_SPOT: Pose = { x: TEACHER.x, z: TEACHER.z + 1.5, yaw: 0 };
const STATION = INTERACTIONS.study_spot;
export const STATION_SPOT: Pose = {
  x: LEARNING_DESK.x - 1.85,
  z: LEARNING_DESK.z,
  yaw: yawFacing({ x: LEARNING_DESK.x - 1.85, z: LEARNING_DESK.z }, STATION),
};
/** Facing the teacher but past the reach limit. */
export const TEACHER_TOO_FAR: Pose = { x: TEACHER.x, z: TEACHER.z + INTERACTIONS.teacher.reach + 0.2, yaw: 0 };

export const snap = (page: Page): Promise<Snapshot> => page.evaluate(() => window.__AA_TEST__!.classroom!.snapshot());

export const waitClassroomReady = (page: Page) =>
  page.waitForFunction(() => window.__AA_TEST__?.classroom?.ready() === true, undefined, { timeout: 45_000 });

export async function enterClassroom(page: Page) {
  await page.goto(paths.classroom);
  await waitClassroomReady(page);
}

/** Moves the player with the test hook and confirms the hook put it exactly there. */
export async function place(page: Page, pose: Pose, pitch = 0) {
  await page.evaluate(([x, z, yaw, p]) => {
    const hook = window.__AA_TEST__!.classroom!;
    hook.teleport(x, z, yaw);
    hook.setLook(yaw, p);
  }, [pose.x, pose.z, pose.yaw, pitch]);
  const s = await snap(page);
  expect(distance(s.position, pose), "hook did not place the player where asked").toBeLessThan(0.01);
}

export const pause = (page: Page, ms: number) => page.waitForTimeout(ms);

export async function holdKeys(page: Page, keys: string[], ms: number) {
  for (const k of keys) await page.keyboard.down(k);
  await pause(page, ms);
  for (const k of keys) await page.keyboard.up(k);
}

/** Waits past the last frame after input ended, then requires the position to hold still. */
export async function expectStopped(page: Page) {
  await pause(page, 200);
  const a = await snap(page);
  await pause(page, 350);
  const b = await snap(page);
  expect(distance(a.position, b.position), "player kept moving").toBeLessThan(0.005);
  expect(b.moving).toBe(false);
}

/** A stop proves nothing unless the player was actually walking first. */
export async function expectWalking(page: Page) {
  const a = await snap(page);
  await pause(page, 250);
  const b = await snap(page);
  expect(distance(a.position, b.position), "player was not walking").toBeGreaterThan(0.05);
}

/** Holds a key until the predicate holds. Used to walk to a place with real input instead of the teleport hook. */
export async function walkUntil(page: Page, key: string, done: (position: Vec) => boolean, deadlineMs = 8_000) {
  await page.keyboard.down(key);
  try {
    const start = Date.now();
    while (Date.now() - start < deadlineMs) {
      if (done((await snap(page)).position)) return;
      await pause(page, 25);
    }
    throw new Error(`walkUntil: not reached within ${deadlineMs} ms, stopped at ${JSON.stringify((await snap(page)).position)}`);
  } finally {
    await page.keyboard.up(key);
  }
}

/**
 * Speed in m/s as the slope of position over time. Slow software rendering makes the frame step large, so a
 * two-point comparison would carry a whole frame of error.
 */
export async function speed(page: Page, keys: string[], sampleMs = 800) {
  for (const k of keys) await page.keyboard.down(k);
  await pause(page, 250);
  const samples: { t: number; x: number; z: number }[] = [];
  const end = Date.now() + sampleMs;
  while (Date.now() < end) {
    samples.push(await page.evaluate(() => {
      const { position } = window.__AA_TEST__!.classroom!.snapshot();
      return { t: performance.now(), x: position.x, z: position.z };
    }));
    await pause(page, 25);
  }
  for (const k of keys) await page.keyboard.up(k);
  await pause(page, 200);
  const meanT = samples.reduce((sum, s) => sum + s.t, 0) / samples.length;
  const slope = (axis: "x" | "z") => {
    const mean = samples.reduce((sum, s) => sum + s[axis], 0) / samples.length;
    const top = samples.reduce((sum, s) => sum + (s.t - meanT) * (s[axis] - mean), 0);
    return top / samples.reduce((sum, s) => sum + (s.t - meanT) ** 2, 0);
  };
  return Math.hypot(slope("x"), slope("z")) * 1000;
}

export const teacherDialog = (page: Page) => page.getByRole("dialog", { name: "Talk to your teacher" });
export const learningDialog = (page: Page) => page.getByRole("dialog", { name: "Learning station" });
export const closeTeacher = (page: Page) => teacherDialog(page).getByRole("button", { name: "Close" }).click();
export const interactPrompt = (page: Page) => page.locator(id("classroom-interact"));
export const lookPrompt = (page: Page) => page.getByRole("button", { name: "Click to look around" });
export const classroomRoot = (page: Page) => page.locator(id("classroom"));

export async function openTeacher(page: Page) {
  await place(page, TEACHER_SPOT);
  expect((await snap(page)).target).toBe("teacher");
  await page.keyboard.press(INTERACT_KEY);
  await expect(teacherDialog(page)).toBeVisible();
}

export async function openLearning(page: Page) {
  await enterClassroom(page);
  await place(page, STATION_SPOT);
  expect((await snap(page)).target).toBe("study_spot");
  await page.keyboard.press(INTERACT_KEY);
  await expect(learningDialog(page)).toBeVisible();
}

export type Hue = "magenta" | "cyan";

/** Hue test rather than an exact colour, because the 3D frame is lit and tone mapped. */
const hueTest = `(hue, r, g, b) => hue === "magenta"
  ? r > 110 && b > 50 && g < r * 0.5 && g < b * 0.75
  : b > 110 && g > 80 && r < b * 0.5 && r < g * 0.75`;

/** Share of a PNG's pixels that fall in a hue range. */
export async function hueShare(page: Page, png: Buffer, hue: Hue) {
  return page.evaluate(async ([b64, wanted, test]) => {
    const match = new Function(`return ${test}`)() as (h: string, r: number, g: number, b: number) => boolean;
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const bmp = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
    const c = new OffscreenCanvas(bmp.width, bmp.height).getContext("2d")!;
    c.drawImage(bmp, 0, 0);
    const d = c.getImageData(0, 0, bmp.width, bmp.height).data;
    let hit = 0;
    for (let i = 0; i < d.length; i += 4) if (match(wanted, d[i], d[i + 1], d[i + 2])) hit++;
    return hit / (d.length / 4);
  }, [png.toString("base64"), hue, hueTest] as const);
}

/** Extent in pixels of the region in a hue. Rows and columns with under 3 hits are ignored as noise. */
export async function hueBounds(page: Page, png: Buffer, hue: Hue) {
  return page.evaluate(async ([b64, wanted, test]) => {
    const match = new Function(`return ${test}`)() as (h: string, r: number, g: number, b: number) => boolean;
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const bmp = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
    const c = new OffscreenCanvas(bmp.width, bmp.height).getContext("2d")!;
    c.drawImage(bmp, 0, 0);
    const d = c.getImageData(0, 0, bmp.width, bmp.height).data;
    const columns = new Array<number>(bmp.width).fill(0);
    const rows = new Array<number>(bmp.height).fill(0);
    for (let i = 0; i < d.length; i += 4) {
      if (!match(wanted, d[i], d[i + 1], d[i + 2])) continue;
      const at = i / 4;
      columns[at % bmp.width]++;
      rows[Math.floor(at / bmp.width)]++;
    }
    const extent = (counts: number[]) => {
      const hit = counts.flatMap((count, index) => (count >= 3 ? [index] : []));
      return hit.length ? hit[hit.length - 1] - hit[0] + 1 : 0;
    };
    return { width: extent(columns), height: extent(rows) };
  }, [png.toString("base64"), hue, hueTest] as const);
}

export const myAgentPill = (page: Page) => page.locator(id("classroom-my-agent"));
export const characterCard = (page: Page) => page.locator(id("classroom-character-card"));

/** Decoded size and hue share of a real <img>. A broken or empty image fails on the natural size. */
export async function imagePixels(image: Locator, hue: Hue) {
  return image.evaluate((element, [wanted, test]) => {
    const match = new Function(`return ${test}`)() as (h: string, r: number, g: number, b: number) => boolean;
    const img = element as HTMLImageElement;
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    let share = 0;
    if (img.naturalWidth > 0) {
      const c = canvas.getContext("2d")!;
      c.drawImage(img, 0, 0);
      const d = c.getImageData(0, 0, canvas.width, canvas.height).data;
      let hit = 0;
      for (let i = 0; i < d.length; i += 4) if (match(wanted, d[i], d[i + 1], d[i + 2])) hit++;
      share = hit / (d.length / 4);
    }
    return {
      complete: img.complete,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      src: new URL(img.currentSrc || img.src).pathname,
      share,
    };
  }, [hue, hueTest] as const);
}

export async function openCharacterCard(page: Page) {
  const toggle = page.locator(id("classroom-character-toggle"));
  if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
  await expect(characterCard(page)).toBeVisible();
}

// Mirrors AvatarFrame: the frame stands near the aisle corner of the player's desk and turns 0.7 rad toward the aisle.
const FRAME_DESK = STUDENT_DESKS[0];
const FRAME = { x: FRAME_DESK.x + FRAME_DESK.w / 2 - 0.3, z: FRAME_DESK.z - 0.12, turn: 0.7 };
/** One metre back along the frame's normal, looking down at it. */
export const FRAME_VIEW: Pose = {
  x: FRAME.x + Math.sin(FRAME.turn),
  z: FRAME.z + Math.cos(FRAME.turn),
  yaw: FRAME.turn,
};
export const FRAME_VIEW_PITCH = -0.38;

/** Renders the desk picture frame in view and captures the middle of the 3D canvas, where it sits. */
export async function framePng(page: Page) {
  await place(page, FRAME_VIEW, FRAME_VIEW_PITCH);
  await pause(page, 400);
  const box = (await classroomRoot(page).locator("canvas").first().boundingBox())!;
  return page.screenshot({
    clip: { x: box.x + box.width / 3, y: box.y + box.height / 4, width: box.width / 3, height: box.height / 2 },
  });
}

/** Solid PNG generated in the browser, so no binary fixture is stored in the repository. */
export async function solidPng(page: Page, css: string) {
  const url = await page.evaluate((fill) => {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const x = c.getContext("2d")!;
    x.fillStyle = fill;
    x.fillRect(0, 0, 64, 64);
    return c.toDataURL("image/png");
  }, css);
  return Buffer.from(url.split(",")[1], "base64");
}

/** Only the catalog search is doubled. Save, avatar and classroom are real. Not evidence of a live catalog. */
export const stubCatalog = (page: Page) =>
  page.route(api.catalogSearch, (route) => route.fulfill({ json: ok(catalogPage()) }));

/** Opens the DOM catalog alternative. A browser without WebGL starts there and has no toggle. */
export async function openCatalogList(page: Page, modelId: string) {
  await page.goto(paths.onboarding);
  const toggle = page.getByRole("button", { name: "List view" });
  const option = page.locator(id(`model-option-${modelId}`));
  await expect(toggle.or(option).first()).toBeVisible();
  if (await toggle.isVisible()) await toggle.click();
  await expect(option).toBeVisible();
}

export interface CurrentAgent {
  agentId: string;
  name: string;
  version: number;
  selectedModel: { modelId: string; revision: string | null } | null;
  avatar: { inputKind: "drawing" | "photo"; renderUrl: string; originalUrl: string } | null;
}

/** The saved profile as the server has it. The test hook no longer carries the agent. */
export async function currentAgent(page: Page): Promise<CurrentAgent | null> {
  const res = await page.request.get("/api/agents/current");
  expect(res.status()).toBe(200);
  return (await res.json()).data.agent;
}

/** Creates an agent with a selected model in the real store. Cookies are shared with the page. */
export async function seedAgent(page: Page): Promise<{ agentId: string }> {
  const res = await page.request.put("/api/agents/current", {
    data: { name: "Test student", selectedModel: baseModel, avatarAssetId: null, expectedVersion: null },
  });
  expect(res.status()).toBe(200);
  return (await res.json()).data;
}

/** Saves a solid colour avatar through the real upload path. */
export async function seedAvatarAgent(page: Page, css: string) {
  await page.goto(paths.landing);
  const buffer = await solidPng(page, css);
  const file = { name: "a.png", mimeType: "image/png", buffer };
  const upload = await page.request.post("/api/avatars", { multipart: { inputKind: "drawing", original: file, render: file } });
  expect(upload.status()).toBe(200);
  const { assetId } = (await upload.json()).data;
  const res = await page.request.put("/api/agents/current", {
    data: { name: "Test student", selectedModel: baseModel, avatarAssetId: assetId, expectedVersion: null },
  });
  expect(res.status()).toBe(200);
}

/** All product text a user can see or a screen reader announces on the current screen. */
export async function visibleCopy(page: Page) {
  return page.evaluate(() => {
    const EXEMPT = "script, style, noscript, code, pre, kbd, samp, [data-copy-exempt]";
    const visible = (element: Element) => {
      if (element.closest(EXEMPT)) return false;
      const box = element.getBoundingClientRect();
      return box.width > 0 && box.height > 0 && element.checkVisibility({ visibilityProperty: true });
    };
    const out = new Set<string>();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const text = node.textContent?.trim();
      if (text && node.parentElement && visible(node.parentElement)) out.add(text);
    }
    for (const element of document.body.querySelectorAll("[aria-label], [placeholder], [title], img[alt]")) {
      if (!visible(element)) continue;
      for (const name of ["aria-label", "placeholder", "title", "alt"]) {
        const value = element.getAttribute(name)?.trim();
        if (value) out.add(value);
      }
    }
    return [...out];
  });
}

/** R-028: no Hangul and no sentence-ending periods in what the user can see right now. */
export async function expectCleanCopy(page: Page) {
  const problems = (await visibleCopy(page)).flatMap(copyViolations);
  expect(problems).toEqual([]);
}

export function overlaps(a: { x: number; y: number; width: number; height: number }, b: typeof a) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

export async function expectNoOverlap(page: Page, items: Record<string, Locator>) {
  const viewport = page.viewportSize()!;
  const boxes: [string, NonNullable<Awaited<ReturnType<Locator["boundingBox"]>>>][] = [];
  for (const [name, locator] of Object.entries(items)) {
    await expect(locator, name).toBeVisible();
    const box = (await locator.boundingBox())!;
    expect(box.x, `${name} overflows left`).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, `${name} overflows right`).toBeLessThanOrEqual(viewport.width);
    expect(box.y, `${name} overflows top`).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height, `${name} overflows bottom`).toBeLessThanOrEqual(viewport.height);
    boxes.push([name, box]);
  }
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      expect(overlaps(boxes[i][1], boxes[j][1]), `${boxes[i][0]} overlaps ${boxes[j][0]}`).toBe(false);
    }
  }
}

export async function expectOnTop(locator: Locator, name: string) {
  await locator.scrollIntoViewIfNeeded();
  const hit = await locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const top = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return top === element || element.contains(top) || (top?.contains(element) ?? false);
  });
  expect(hit, `${name} is covered by another element`).toBe(true);
}

export const expectNoSideScroll = async (page: Page) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
