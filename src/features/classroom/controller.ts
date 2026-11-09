// Owns the player's pose and every rule for when input must stop. Plain class so
// the render loop can read it each frame without re-rendering React.

import type { ClassroomTarget } from "@/shared/contracts";
import {
  BOX_COLLIDERS,
  CIRCLE_COLLIDERS,
  INTERACTIONS,
  PLAYER,
  ROOM,
  SPAWN,
} from "@/shared/world/layout";
import {
  clampPitch,
  pickTarget,
  stepPlayer,
  wrapYaw,
  type CollisionWorld,
  type MoveIntent,
} from "./movement";

type Move = "forward" | "back" | "left" | "right";

// event.code stays stable across layouts, including Korean IME input.
const KEY_TO_MOVE: Record<string, Move> = {
  KeyW: "forward",
  ArrowUp: "forward",
  KeyS: "back",
  ArrowDown: "back",
  KeyA: "left",
  ArrowLeft: "left",
  KeyD: "right",
  ArrowRight: "right",
};

export const MOUSE_LOOK_SENSITIVITY = 0.0022;
export const TOUCH_LOOK_SENSITIVITY = 0.0055;
// Browsers occasionally report one wild movementX while a pointer lock settles.
const MAX_LOOK_EVENT_PIXELS = 240;

const WORLD: CollisionWorld = {
  bounds: ROOM,
  boxes: BOX_COLLIDERS,
  circles: CIRCLE_COLLIDERS,
  radius: PLAYER.radius,
  speed: PLAYER.walkSpeed,
};

export function isEditableTarget(target: EventTarget | null): boolean {
  if (typeof Element === "undefined" || !(target instanceof Element)) return false;
  if (target instanceof HTMLElement && target.isContentEditable) return true;
  return target.closest("input, textarea, select, [contenteditable='true']") !== null;
}

export interface ControllerCallbacks {
  onInteract: (target: ClassroomTarget) => void;
  onTargetChange: (target: ClassroomTarget | null) => void;
  onPointerLockChange: (locked: boolean) => void;
  onLookFailed: () => void;
}

const NO_CALLBACKS: ControllerCallbacks = {
  onInteract: () => undefined,
  onTargetChange: () => undefined,
  onPointerLockChange: () => undefined,
  onLookFailed: () => undefined,
};

export class FirstPersonController {
  x: number = SPAWN.x;
  z: number = SPAWN.z;
  yaw: number = SPAWN.yaw;
  pitch = 0;
  moving = false;
  target: ClassroomTarget | null = null;
  pointerLocked = false;
  locked = false;

  private callbacks = NO_CALLBACKS;
  private canvas: HTMLCanvasElement | null = null;
  private listeners: AbortController | null = null;
  private readonly heldCodes = new Set<string>();
  private stick: MoveIntent = { forward: 0, strafe: 0 };
  private readonly clearListeners = new Set<() => void>();

  setCallbacks(callbacks: ControllerCallbacks): void {
    this.callbacks = callbacks;
  }

  attachCanvas(canvas: HTMLCanvasElement | null): void {
    this.canvas = canvas;
  }

  /** Installs the window listeners. Safe to pair with stop() repeatedly. */
  start(): void {
    this.listeners?.abort();
    const abort = new AbortController();
    this.listeners = abort;
    const { signal } = abort;
    window.addEventListener("keydown", this.onKeyDown, { signal });
    window.addEventListener("keyup", this.onKeyUp, { signal });
    window.addEventListener("blur", this.clearHeld, { signal });
    window.addEventListener("pagehide", this.clearHeld, { signal });
    window.addEventListener("pointercancel", this.clearHeld, { signal });
    document.addEventListener("visibilitychange", this.onVisibility, { signal });
    document.addEventListener("focusin", this.onFocusIn, { signal });
    document.addEventListener("mousemove", this.onMouseMove, { signal });
    document.addEventListener("pointerlockchange", this.onPointerLockChange, { signal });
    document.addEventListener("pointerlockerror", this.onPointerLockError, { signal });
  }

  stop(): void {
    this.listeners?.abort();
    this.listeners = null;
    this.clearHeld();
    this.moving = false;
    if (this.canvas && document.pointerLockElement === this.canvas) document.exitPointerLock();
    this.setPointerLocked(false);
    this.setTarget(null);
  }

  /** Called from an explicit user action only. A browser refusal is reported, not thrown. */
  requestLook(): void {
    if (!this.canvas || this.locked) return;
    try {
      // Older browsers return undefined rather than a promise.
      Promise.resolve(this.canvas.requestPointerLock()).catch(this.onPointerLockError);
    } catch {
      this.onPointerLockError();
    }
  }

  setLocked(locked: boolean): void {
    if (this.locked === locked) return;
    this.locked = locked;
    if (!locked) return;
    this.clearHeld();
    this.moving = false;
    if (this.canvas && document.pointerLockElement === this.canvas) document.exitPointerLock();
  }

  /** Stick vector: x to the right, y forward, each in -1..1. */
  setStick(x: number, y: number): void {
    this.stick = this.locked ? { forward: 0, strafe: 0 } : { forward: y, strafe: x };
  }

  /** Adds a look gesture in screen pixels. Ignored while input is locked. */
  addLook(dxPixels: number, dyPixels: number, sensitivity: number): void {
    if (this.locked) return;
    this.yaw = wrapYaw(this.yaw - dxPixels * sensitivity);
    this.pitch = clampPitch(this.pitch - dyPixels * sensitivity);
  }

  /** Touch controls register here so they reset whenever held input is cleared. */
  onClear(listener: () => void): () => void {
    this.clearListeners.add(listener);
    return () => this.clearListeners.delete(listener);
  }

  /** Advances one rendered frame. */
  update(dtSeconds: number): void {
    const next = stepPlayer({ x: this.x, z: this.z }, this.currentIntent(), this.yaw, dtSeconds, WORLD);
    this.x = next.x;
    this.z = next.z;
    this.moving = next.moving;
    this.refreshTarget();
  }

  interact(): void {
    if (!this.locked && this.target) this.callbacks.onInteract(this.target);
  }

  /** Test hook only: no collision correction, so a test can place the player exactly. */
  teleport(x: number, z: number, yaw?: number): void {
    this.x = x;
    this.z = z;
    if (yaw !== undefined) this.yaw = wrapYaw(yaw);
    this.moving = false;
    this.refreshTarget();
  }

  /** Test hook only. Pitch is still clamped. */
  setLook(yaw: number, pitch: number): void {
    this.yaw = wrapYaw(yaw);
    this.pitch = clampPitch(pitch);
    this.refreshTarget();
  }

  private currentIntent(): MoveIntent {
    if (this.locked) return { forward: 0, strafe: 0 };
    let { forward, strafe } = this.stick;
    for (const code of this.heldCodes) {
      const move = KEY_TO_MOVE[code];
      if (move === "forward") forward += 1;
      if (move === "back") forward -= 1;
      if (move === "right") strafe += 1;
      if (move === "left") strafe -= 1;
    }
    return { forward, strafe };
  }

  private refreshTarget(): void {
    this.setTarget(pickTarget({ x: this.x, z: this.z }, this.yaw, this.pitch, INTERACTIONS));
  }

  private setTarget(target: ClassroomTarget | null): void {
    if (this.target === target) return;
    this.target = target;
    this.callbacks.onTargetChange(target);
  }

  private setPointerLocked(locked: boolean): void {
    if (this.pointerLocked === locked) return;
    this.pointerLocked = locked;
    this.callbacks.onPointerLockChange(locked);
  }

  private readonly clearHeld = (): void => {
    this.heldCodes.clear();
    this.stick = { forward: 0, strafe: 0 };
    for (const listener of this.clearListeners) listener();
  };

  private readonly onVisibility = (): void => {
    if (document.visibilityState !== "visible") this.clearHeld();
  };

  private readonly onFocusIn = (event: FocusEvent): void => {
    if (isEditableTarget(event.target)) this.clearHeld();
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    // macOS never sends keyup for keys held while Command goes down.
    if (event.key === "Meta") this.clearHeld();
    if (this.locked || isEditableTarget(event.target)) return;
    if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;

    if (event.code in KEY_TO_MOVE) {
      event.preventDefault(); // Arrow keys must not scroll the page.
      // Auto-repeat must not revive a key that blur or a dialog already cleared.
      if (!event.repeat) this.heldCodes.add(event.code);
      return;
    }
    if (event.code === "KeyE" && !event.repeat) this.interact();
  };

  // Deliberately not gated on lock or focus: a release must always count.
  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.heldCodes.delete(event.code);
  };

  private readonly onMouseMove = (event: MouseEvent): void => {
    if (!this.pointerLocked || this.locked) return;
    const clampPixels = (value: number) =>
      Math.min(MAX_LOOK_EVENT_PIXELS, Math.max(-MAX_LOOK_EVENT_PIXELS, value));
    this.addLook(clampPixels(event.movementX), clampPixels(event.movementY), MOUSE_LOOK_SENSITIVITY);
  };

  private readonly onPointerLockChange = (): void => {
    const held = this.canvas !== null && document.pointerLockElement === this.canvas;
    // A request that resolves after a dialog opened must not keep the pointer.
    if (held && this.locked) {
      document.exitPointerLock();
      return;
    }
    if (!held) this.clearHeld();
    this.setPointerLocked(held);
  };

  private readonly onPointerLockError = (): void => {
    this.callbacks.onLookFailed();
  };
}
