// Merges keyboard and on-screen pad input, and owns every rule for when
// movement must stop. Keys are read from window rather than Phaser's keyboard
// plugin because Phaser captures keys globally, which would swallow W/A/S/D
// typed into the DOM teacher chat.

import type { Vec2 } from "./movement";

type Direction = "up" | "down" | "left" | "right";

const KEY_TO_DIRECTION: Record<string, Direction> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  // event.code stays stable across layouts, including Korean IME input.
  KeyW: "up",
  KeyS: "down",
  KeyA: "left",
  KeyD: "right",
};

const INTERACT_CODES = new Set(["KeyE", "Enter", "Space"]);

export function isEditableTarget(target: EventTarget | null): boolean {
  if (typeof Element === "undefined" || !(target instanceof Element)) return false;
  if (target instanceof HTMLElement && target.isContentEditable) return true;
  return target.closest("input, textarea, select, [contenteditable='true']") !== null;
}

export type InputOptions = {
  onInteract: () => void;
};

export class ClassroomInput {
  private readonly heldCodes = new Set<string>();
  private pad: Vec2 = { x: 0, y: 0 };
  private locked = false;
  private readonly controller = new AbortController();

  constructor(
    private readonly target: Window,
    private readonly options: InputOptions,
  ) {
    const { signal } = this.controller;
    target.addEventListener("keydown", this.onKeyDown, { signal });
    target.addEventListener("keyup", this.onKeyUp, { signal });
    target.addEventListener("blur", this.releaseAll, { signal });
    target.addEventListener("pagehide", this.releaseAll, { signal });
    target.document.addEventListener("visibilitychange", this.onVisibility, { signal });
    target.document.addEventListener("focusin", this.onFocusIn, { signal });
  }

  /** The current intended direction. Always zero while locked. */
  read(): Vec2 {
    if (this.locked) return { x: 0, y: 0 };
    let x = this.pad.x;
    let y = this.pad.y;
    for (const code of this.heldCodes) {
      const direction = KEY_TO_DIRECTION[code];
      if (direction === "left") x -= 1;
      if (direction === "right") x += 1;
      if (direction === "up") y -= 1;
      if (direction === "down") y += 1;
    }
    return { x, y };
  }

  /** While locked (dialog open), input is dropped rather than queued. */
  setLocked(locked: boolean): void {
    this.locked = locked;
    if (locked) this.releaseAll();
  }

  /** Pad vector in the same axes as the keyboard; (0, 0) on release. */
  setPad(vector: Vec2): void {
    this.pad = this.locked ? { x: 0, y: 0 } : vector;
  }

  destroy(): void {
    this.controller.abort();
    this.releaseAll();
  }

  private readonly releaseAll = (): void => {
    this.heldCodes.clear();
    this.pad = { x: 0, y: 0 };
  };

  private readonly onVisibility = (): void => {
    if (this.target.document.visibilityState !== "visible") this.releaseAll();
  };

  private readonly onFocusIn = (event: FocusEvent): void => {
    if (isEditableTarget(event.target)) this.releaseAll();
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (this.locked || isEditableTarget(event.target)) return;
    if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;

    if (event.code in KEY_TO_DIRECTION) {
      this.heldCodes.add(event.code);
      event.preventDefault(); // Arrow keys must not scroll the page.
      return;
    }
    if (INTERACT_CODES.has(event.code) && !event.repeat) {
      // Enter/Space on a focused button already activates that button.
      if (event.target instanceof Element && event.target.closest("button, a")) return;
      event.preventDefault();
      this.options.onInteract();
    }
  };

  // Deliberately not gated on lock or focus: a release must always count,
  // otherwise a key lifted inside a text box stays held forever.
  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.heldCodes.delete(event.code);
  };
}
