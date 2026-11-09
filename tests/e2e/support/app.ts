import { expect, type Page } from "@playwright/test";

// 제품 UI와 맞물리는 지점은 이 파일 하나로 모은다. 경로·testid는 A/B/C/D 확정 후 조정한다.
// /create, /classroom, API 경로는 A의 초안에서 확인했다. 학습 패널은 교실 안 오버레이라서
// paths.learning은 D의 진입 방식이 정해지면 helper로 바꾼다.
export const paths = { classroom: "/classroom", onboarding: "/create", learning: "/learning" };
export const api = {
  quote: "**/api/pricing/quotes",
  training: "**/api/training/runs**",
  runtime: "**/api/artifacts/*/runtime",
};
export const INTERACT_KEY = "e";
export const id = (name: string) => `[data-testid="${name}"]`;

export interface Rect { x: number; y: number; w: number; h: number }
export interface Snapshot {
  footprint: Rect;
  world: { w: number; h: number };
  obstacles: Rect[];
  teacher: { x: number; y: number };
  moving: boolean;
  paused: boolean;
  screen: Rect;
  agent: { agentId: string; selectedModelId: string; avatarSource: "drawing" | "photo" | null };
}

interface ClassroomTestHook {
  ready(): boolean;
  snapshot(): Snapshot;
  teleport(x: number, y: number): void;
  remount(): void;
}

declare global {
  interface Window { __AA_TEST__?: { classroom?: ClassroomTestHook } }
}

/** 명시적 테스트 모드에서만 존재해야 하는 관측 hook. docs/qa 요청 목록 H-1 참고. */
export const snap = (page: Page): Promise<Snapshot> =>
  page.evaluate(() => window.__AA_TEST__!.classroom!.snapshot());

export const teleport = (page: Page, x: number, y: number) =>
  page.evaluate(([px, py]) => window.__AA_TEST__!.classroom!.teleport(px, py), [x, y]);

export async function enterClassroom(page: Page) {
  await page.goto(paths.classroom);
  await page.waitForFunction(() => window.__AA_TEST__?.classroom?.ready() === true);
}

export const pause = (page: Page, ms: number) => page.waitForTimeout(ms);

export async function holdKeys(page: Page, keys: string[], ms: number) {
  for (const k of keys) await page.keyboard.down(k);
  await pause(page, ms);
  for (const k of keys) await page.keyboard.up(k);
}

/** 입력을 뗀 뒤 위치가 멈출 시간을 주고 그 뒤 위치 고정을 확인한다. */
export async function expectStopped(page: Page) {
  await pause(page, 150);
  const a = await snap(page);
  await pause(page, 350);
  const b = await snap(page);
  expect(Math.hypot(b.footprint.x - a.footprint.x, b.footprint.y - a.footprint.y)).toBeLessThan(0.5);
}

export async function speed(page: Page, keys: string[]) {
  const a = await snap(page);
  const t0 = Date.now();
  await holdKeys(page, keys, 500);
  const elapsed = Date.now() - t0;
  const b = await snap(page);
  return Math.hypot(b.footprint.x - a.footprint.x, b.footprint.y - a.footprint.y) / elapsed;
}

export async function openTeacher(page: Page) {
  const s = await snap(page);
  await teleport(page, s.teacher.x, s.teacher.y + 50);
  await page.keyboard.press(INTERACT_KEY);
  await expect(teacherDialog(page)).toBeVisible();
}

// A의 smoke 테스트와 같은 접근 가능한 이름을 쓴다.
export const teacherDialog = (page: Page) => page.getByRole("dialog", { name: "선생님 상담" });
export const closeTeacher = (page: Page) => teacherDialog(page).getByRole("button", { name: "닫기" }).click();

/** 렌더된 PNG 영역에서 특정 색에 가까운 픽셀 비율. 새 의존성 없이 브라우저에서 해독한다. */
export async function colorShare(page: Page, png: Buffer, rgb: [number, number, number]) {
  return page.evaluate(async ([b64, [r, g, b]]) => {
    const bytes = Uint8Array.from(atob(b64 as string), (c) => c.charCodeAt(0));
    const bmp = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
    const c = new OffscreenCanvas(bmp.width, bmp.height).getContext("2d")!;
    c.drawImage(bmp, 0, 0);
    const d = c.getImageData(0, 0, bmp.width, bmp.height).data;
    let hit = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (Math.abs(d[i] - (r as number)) + Math.abs(d[i + 1] - (g as number)) + Math.abs(d[i + 2] - (b as number)) < 60) hit++;
    }
    return hit / (d.length / 4);
  }, [png.toString("base64"), rgb] as const);
}

export async function playerShare(page: Page, rgb: [number, number, number]) {
  const canvas = await page.locator("canvas[data-game], canvas").first().boundingBox();
  const s = await snap(page);
  const png = await page.screenshot({
    clip: { x: canvas!.x + s.screen.x, y: canvas!.y + s.screen.y, width: s.screen.w, height: s.screen.h },
  });
  return colorShare(page, png, rgb);
}

/** 단색 PNG를 브라우저에서 만든다. 저장소에 바이너리 fixture를 두지 않는다. */
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
