import { expect, type Page } from "@playwright/test";
import { baseModel, catalogPage, ok } from "./fixtures";

// 제품 UI와 맞물리는 지점은 이 파일 하나로 모은다. 경로·testid는 A/B/C/D 확정 후 조정한다.
export const paths = { classroom: "/classroom", onboarding: "/create" };
export const api = {
  quote: "**/api/pricing/quotes",
  training: "**/api/training/runs**",
  runtime: "**/api/artifacts/*/runtime",
  artifact: "**/api/artifacts/*",
  datasets: "**/api/training/datasets",
  validate: "**/api/training/validate",
  catalogSearch: "**/api/catalog/models**",
};
export const INTERACT_KEY = "e";
// B의 교실 배치(world.ts) 기준 좌표다. 교실 배치가 바뀌면 teleportTo 검사에서 바로 드러난다.
/** 직선과 대각선 측정 구간에 벽·가구가 없는 시작점. */
export const RUNWAY = { x: 620, y: 380 };
/** 학습 자리 상호작용 범위 안의 빈 바닥. */
export const STUDY_SPOT = { x: 967, y: 620 };
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

export const waitClassroomReady = (page: Page) =>
  page.waitForFunction(() => window.__AA_TEST__?.classroom?.ready() === true);

export async function enterClassroom(page: Page) {
  await page.goto(paths.classroom);
  await waitClassroomReady(page);
}

/** 빈 칸으로 보정되지 않고 요청한 좌표에 도착했는지까지 확인한다. */
export async function teleportTo(page: Page, at: { x: number; y: number }) {
  await teleport(page, at.x, at.y);
  const { footprint } = await snap(page);
  expect(Math.hypot(footprint.x - at.x, footprint.y - at.y)).toBeLessThan(1);
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

// 정규화가 빠져 약 1.41배 빠른 결함이어도 RUNWAY에서 가구에 닿기 전까지만 잰다.
const SAMPLE_MS = 700;

/**
 * 걷는 중 위치를 표본 추출해 기울기로 속력(px/ms)을 구한다.
 * 저사양 WebGL에서는 프레임 간격이 커서 시작·끝 두 점의 비교는 한 프레임 오차가 그대로 드러난다.
 */
export async function speed(page: Page, keys: string[]) {
  for (const k of keys) await page.keyboard.down(k);
  await pause(page, 200);
  const samples: { t: number; x: number; y: number }[] = [];
  const end = Date.now() + SAMPLE_MS;
  while (Date.now() < end) {
    samples.push(await page.evaluate(() => {
      const { footprint } = window.__AA_TEST__!.classroom!.snapshot();
      return { t: performance.now(), x: footprint.x, y: footprint.y };
    }));
    await pause(page, 25);
  }
  for (const k of keys) await page.keyboard.up(k);
  await pause(page, 200);
  const meanT = samples.reduce((sum, s) => sum + s.t, 0) / samples.length;
  const slope = (axis: "x" | "y") => {
    const mean = samples.reduce((sum, s) => sum + s[axis], 0) / samples.length;
    const top = samples.reduce((sum, s) => sum + (s.t - meanT) * (s[axis] - mean), 0);
    return top / samples.reduce((sum, s) => sum + (s.t - meanT) ** 2, 0);
  };
  return Math.hypot(slope("x"), slope("y"));
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

/** 특정 색 영역의 경계 상자 크기(px). 잡티를 무시하려고 3픽셀 이상 잡힌 행·열만 센다. */
export async function colorBounds(page: Page, png: Buffer, rgb: [number, number, number]) {
  return page.evaluate(async ([b64, [r, g, b]]) => {
    const bytes = Uint8Array.from(atob(b64 as string), (c) => c.charCodeAt(0));
    const bmp = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
    const c = new OffscreenCanvas(bmp.width, bmp.height).getContext("2d")!;
    c.drawImage(bmp, 0, 0);
    const d = c.getImageData(0, 0, bmp.width, bmp.height).data;
    const columns = new Array<number>(bmp.width).fill(0);
    const rows = new Array<number>(bmp.height).fill(0);
    for (let i = 0; i < d.length; i += 4) {
      if (Math.abs(d[i] - (r as number)) + Math.abs(d[i + 1] - (g as number)) + Math.abs(d[i + 2] - (b as number)) >= 60) continue;
      const at = i / 4;
      columns[at % bmp.width]++;
      rows[Math.floor(at / bmp.width)]++;
    }
    const extent = (counts: number[]) => {
      const hit = counts.flatMap((count, index) => (count >= 3 ? [index] : []));
      return hit.length ? hit[hit.length - 1] - hit[0] + 1 : 0;
    };
    return { width: extent(columns), height: extent(rows) };
  }, [png.toString("base64"), rgb] as const);
}

/** 플레이어가 그려진 화면 영역의 캡처. */
export async function playerPng(page: Page) {
  const canvas = await page.locator("canvas[data-game], canvas").first().boundingBox();
  const s = await snap(page);
  return page.screenshot({ clip: { x: canvas!.x + s.screen.x, y: canvas!.y + s.screen.y, width: s.screen.w, height: s.screen.h } });
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

/** 카탈로그 검색만 대역으로 바꾼다. 저장·외형·교실은 실제 경로다. 실제 카탈로그 응답의 증거가 아니다. */
export const stubCatalog = (page: Page) =>
  page.route(api.catalogSearch, (route) => route.fulfill({ json: ok(catalogPage()) }));

export const learningDialog = (page: Page) => page.getByRole("dialog", { name: "학습 준비" });

/** 실제 저장 계층에 선택 모델이 있는 에이전트를 만든다. 쿠키는 page와 공유된다. */
export async function seedAgent(page: Page): Promise<{ agentId: string }> {
  const res = await page.request.put("/api/agents/current", {
    data: { name: "검증용 학생", selectedModel: baseModel, avatarAssetId: null, expectedVersion: null },
  });
  expect(res.status()).toBe(200);
  return (await res.json()).data;
}

/** 단색 외형을 실제 업로드 경로로 저장한다. 교실에서 픽셀로 식별하기 위한 입력이다. */
export async function seedAvatarAgent(page: Page, css: string) {
  const buffer = await solidPng(page, css);
  const file = { name: "a.png", mimeType: "image/png", buffer };
  const upload = await page.request.post("/api/avatars", { multipart: { inputKind: "drawing", original: file, render: file } });
  expect(upload.status()).toBe(200);
  const { assetId } = (await upload.json()).data;
  const res = await page.request.put("/api/agents/current", {
    data: { name: "검증용 학생", selectedModel: baseModel, avatarAssetId: assetId, expectedVersion: null },
  });
  expect(res.status()).toBe(200);
}

export async function openLearning(page: Page) {
  await enterClassroom(page);
  await teleportTo(page, STUDY_SPOT);
  await page.keyboard.press(INTERACT_KEY);
  await expect(learningDialog(page)).toBeVisible();
}
