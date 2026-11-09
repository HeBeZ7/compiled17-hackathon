import type { CDPSession, Page } from "@playwright/test";

// Doubles of browser facilities, installed before page code runs. Results obtained through these are
// FIXTURE-grade evidence of the page's own logic and say nothing about the real browser API.

interface PointerLockDouble {
  requests: number;
  requestsWithoutGesture: number;
  exits: number;
  refuse: boolean;
  /** The browser ending the lock on its own, as it does on Escape. */
  browserRelease(): void;
}

interface FrameThrottle { delayMs: number; frames: number }

declare global {
  interface Window {
    __AA_POINTER_LOCK__?: PointerLockDouble;
    __AA_FRAMES__?: FrameThrottle;
  }
}

/** Replaces the Pointer Lock API, which headless browsers may not implement. */
export const installPointerLockDouble = (page: Page) =>
  page.addInitScript(() => {
    let lockedElement: Element | null = null;
    const notify = (type: string) => document.dispatchEvent(new Event(type));
    const release = () => {
      if (!lockedElement) return;
      lockedElement = null;
      notify("pointerlockchange");
    };
    const grant = (element: Element) => {
      lockedElement = element;
      notify("pointerlockchange");
    };
    const state: PointerLockDouble = {
      requests: 0,
      requestsWithoutGesture: 0,
      exits: 0,
      refuse: false,
      browserRelease: release,
    };
    window.__AA_POINTER_LOCK__ = state;
    Object.defineProperty(Document.prototype, "pointerLockElement", { configurable: true, get: () => lockedElement });
    Element.prototype.requestPointerLock = function requestPointerLock(this: Element) {
      state.requests += 1;
      if (!navigator.userActivation.isActive) state.requestsWithoutGesture += 1;
      if (state.refuse) {
        notify("pointerlockerror");
        return Promise.reject(new DOMException("refused by the test double", "SecurityError"));
      }
      grant(this);
      return Promise.resolve();
    } as Element["requestPointerLock"];
    Document.prototype.exitPointerLock = function exitPointerLock() {
      state.exits += 1;
      release();
    };
  });

export const pointerLockCounts = (page: Page) =>
  page.evaluate(() => {
    const { requests, requestsWithoutGesture, exits } = window.__AA_POINTER_LOCK__!;
    return { requests, requestsWithoutGesture, exits };
  });

/** What the browser delivers while the pointer is captured: relative motion with no screen position. */
export const lookBy = (page: Page, movementX: number, movementY: number) =>
  page.evaluate(([x, y]) => {
    document.dispatchEvent(new MouseEvent("mousemove", { movementX: x, movementY: y, bubbles: true }));
  }, [movementX, movementY]);

/** Lets a spec choose the frame rate. requestAnimationFrame callbacks wait this long before the next real frame. */
export const installFrameThrottle = (page: Page) =>
  page.addInitScript(() => {
    const native = window.requestAnimationFrame.bind(window);
    const state: FrameThrottle = { delayMs: 0, frames: 0 };
    window.__AA_FRAMES__ = state;
    window.requestAnimationFrame = (callback) => {
      const schedule = () =>
        native((time) => {
          state.frames += 1;
          callback(time);
        });
      if (state.delayMs <= 0) return schedule();
      return window.setTimeout(schedule, state.delayMs);
    };
  });

export const setFrameDelay = (page: Page, delayMs: number) =>
  page.evaluate((ms) => {
    window.__AA_FRAMES__!.delayMs = ms;
  }, delayMs);

export const frameCount = (page: Page) => page.evaluate(() => window.__AA_FRAMES__!.frames);

export const disableWebGL = (page: Page) =>
  page.addInitScript(() => {
    const real = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function getContext(this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      if (/webgl/i.test(type)) return null;
      return (real as (...args: unknown[]) => unknown).call(this, type, ...rest);
    } as typeof real;
  });

/** A visibility change, which a headless page cannot be made to do for real. */
export const hidePage = (page: Page) =>
  page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    delete (document as { visibilityState?: unknown }).visibilityState;
    document.dispatchEvent(new Event("visibilitychange"));
  });

export interface TouchPoint { id: number; x: number; y: number }

/** Real touch input through the browser's input pipeline, including several fingers at once. */
export async function touchDriver(page: Page) {
  const cdp: CDPSession = await page.context().newCDPSession(page);
  const send = (type: "touchStart" | "touchMove", points: TouchPoint[]) =>
    cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points });
  return {
    start: (points: TouchPoint[]) => send("touchStart", points),
    move: (points: TouchPoint[]) => send("touchMove", points),
    end: () => cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }),
    cancel: () => cdp.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] }),
  };
}
