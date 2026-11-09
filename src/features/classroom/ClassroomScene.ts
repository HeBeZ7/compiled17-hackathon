// The Phaser side of the classroom. Imported only in the browser.

import * as Phaser from "phaser";
import type { ClassroomTarget } from "@/shared/contracts";
import { ART_SCALE } from "./art/canvas";
import {
  STANDEE_FRAME,
  STUDENT_FACINGS,
  STUDENT_FRAME,
  STUDENT_POSES,
  TEACHER_FRAME,
  paintAvatarStandee,
  paintFoot,
  paintPromptBubble,
  paintShadow,
  paintStudentSheet,
  paintTeacherSheet,
  type AvatarInput,
} from "./art/characters";
import { paintProp } from "./art/props";
import { paintRoom } from "./art/room";
import type { Box } from "./movement";
import { distanceToBox, nearestFree, stepActor, type ActorState, type Facing, type Vec2 } from "./movement";
import {
  INTERACTABLES,
  MOVE_WORLD,
  PROPS,
  SPAWN_POSITION,
  TEACHER_POSITION,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  type Interactable,
} from "./world";

export type SceneBridge = {
  /** Device pixels per CSS pixel the game canvas is rendered at. */
  pixelRatio: number;
  readInput: () => Vec2;
  onNearChange: (near: ClassroomTarget | null) => void;
  onActorChange: (actor: ActorState) => void;
  onReady: () => void;
};

const STEP_INTERVAL_MS = 130;
/** Below this zoom the whole room is unreadable, so the camera follows instead. */
const MIN_FIT_ZOOM = 0.62;
const PROMPT_ANCHOR: Record<ClassroomTarget, Vec2> = {
  teacher: { x: TEACHER_POSITION.x + 44, y: TEACHER_POSITION.y - 176 },
  study_spot: { x: 985, y: 556 },
};

function addCanvasTexture(scene: Phaser.Scene, key: string, canvas: HTMLCanvasElement): Phaser.Textures.Texture {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const texture = scene.textures.addCanvas(key, canvas);
  if (!texture) throw new Error(`Could not create texture ${key}`);
  return texture;
}

function sheetFrame(facing: Facing, pose: number): string {
  return `${facing}:${pose}`;
}

export class ClassroomScene extends Phaser.Scene {
  private actor: ActorState = { ...SPAWN_POSITION, facing: "down", moving: false };
  private near: ClassroomTarget | null = null;
  private paused = false;
  private stepClock = 0;
  private stepIndex = 0;
  private blinkClock = 2600;
  private lastFrameAt: number | null = null;

  private body!: Phaser.GameObjects.Container;
  private sprite!: Phaser.GameObjects.Image;
  private feet: Phaser.GameObjects.Image[] = [];
  private nameLabel!: Phaser.GameObjects.Text;
  private teacher!: Phaser.GameObjects.Image;
  private prompt!: Phaser.GameObjects.Image;
  private appliedAvatar: AvatarInput | null = null;
  private pendingAvatar: { image: HTMLImageElement; input: AvatarInput } | null = null;
  private pendingName: string | null = null;

  constructor(private readonly bridge: SceneBridge) {
    super("classroom");
  }

  create(): void {
    addCanvasTexture(this, "room", paintRoom());
    this.add.image(0, 0, "room").setOrigin(0).setScale(1 / ART_SCALE).setDepth(-10);

    this.addProps();
    this.addTeacher();
    this.addPlayer();

    addCanvasTexture(this, "prompt", paintPromptBubble());
    this.prompt = this.add.image(0, 0, "prompt").setScale(1 / ART_SCALE).setDepth(5000).setVisible(false);

    this.scale.on(Phaser.Scale.Events.RESIZE, this.fitCamera, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.fitCamera, this);
    });
    this.fitCamera();

    if (this.pendingAvatar) this.applyAvatar(this.pendingAvatar.image, this.pendingAvatar.input);
    if (this.pendingName !== null) this.nameLabel.setText(this.pendingName);
    this.bridge.onActorChange({ ...this.actor });
    this.bridge.onReady();
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  setPlayerName(name: string): void {
    this.pendingName = name;
    if (this.nameLabel) this.nameLabel.setText(name);
  }

  setAvatar(image: HTMLImageElement, input: AvatarInput): void {
    this.pendingAvatar = { image, input };
    if (this.sprite) this.applyAvatar(image, input);
  }

  clearAvatar(): void {
    this.pendingAvatar = null;
    if (!this.sprite || !this.appliedAvatar) return;
    this.appliedAvatar = null;
    this.feet.forEach((foot) => foot.setVisible(false));
    this.sprite
      .setTexture("student", sheetFrame(this.actor.facing, 0))
      .setOrigin(STUDENT_FRAME.footX / STUDENT_FRAME.width, STUDENT_FRAME.footY / STUDENT_FRAME.height)
      .setAngle(0);
  }

  /** Places the player on the closest free spot. Used by the E2E hook only. */
  teleport(target: Vec2): void {
    const spot = nearestFree(target, MOVE_WORLD);
    if (!spot) return;
    this.actor = { ...this.actor, x: spot.x, y: spot.y, moving: false };
    this.body.setPosition(spot.x, spot.y).setDepth(spot.y);
    // Settled now rather than next frame, so an immediate interaction sees it.
    this.updateNear(this.actor);
    this.bridge.onActorChange({ ...this.actor });
  }

  /** Read-only view of what is really on screen. Used by the E2E hook only. */
  inspect(): { actor: ActorState; avatarSource: AvatarInput | null; playerScreen: Box } {
    const frame = this.appliedAvatar ? STANDEE_FRAME : STUDENT_FRAME;
    const camera = this.cameras.main;
    const scale = camera.zoom / this.bridge.pixelRatio;
    return {
      actor: { ...this.actor },
      avatarSource: this.appliedAvatar,
      playerScreen: {
        x: (this.actor.x - frame.footX - camera.worldView.x) * scale,
        y: (this.actor.y - frame.footY - camera.worldView.y) * scale,
        w: frame.width * scale,
        h: frame.height * scale,
      },
    };
  }

  private addProps(): void {
    PROPS.forEach((prop, index) => {
      const key = `prop-${prop.kind}-${index}`;
      const painted = paintProp(prop.kind, 400 + index * 13);
      addCanvasTexture(this, key, painted.canvas);
      this.add
        .image(prop.x, prop.y, key)
        .setOrigin(0.5, 1)
        .setScale(1 / ART_SCALE)
        .setDepth(prop.collider.y + prop.collider.h / 2);
    });
  }

  private addTeacher(): void {
    const { width, height, footX, footY } = TEACHER_FRAME;
    const texture = addCanvasTexture(this, "teacher", paintTeacherSheet());
    texture.add("open", 0, 0, 0, width * ART_SCALE, height * ART_SCALE);
    texture.add("blink", 0, width * ART_SCALE, 0, width * ART_SCALE, height * ART_SCALE);

    addCanvasTexture(this, "shadow", paintShadow());
    this.add
      .image(TEACHER_POSITION.x, TEACHER_POSITION.y, "shadow")
      .setScale(1.3 / ART_SCALE)
      .setDepth(TEACHER_POSITION.y - 1);
    this.teacher = this.add
      .image(TEACHER_POSITION.x, TEACHER_POSITION.y, "teacher", "open")
      .setOrigin(footX / width, footY / height)
      .setScale(1 / ART_SCALE)
      .setDepth(TEACHER_POSITION.y);

    // A slow breath, so the room is alive while nothing else moves.
    this.tweens.add({
      targets: this.teacher,
      scaleY: (1 / ART_SCALE) * 1.018,
      duration: 1500,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  private addPlayer(): void {
    const { width, height, footX, footY } = STUDENT_FRAME;
    const texture = addCanvasTexture(this, "student", paintStudentSheet());
    STUDENT_FACINGS.forEach((facing, row) => {
      STUDENT_POSES.forEach((pose, column) => {
        texture.add(sheetFrame(facing, pose), 0, column * width * ART_SCALE, row * height * ART_SCALE, width * ART_SCALE, height * ART_SCALE);
      });
    });

    addCanvasTexture(this, "foot", paintFoot());
    const shadow = this.add.image(0, 0, "shadow").setScale(1 / ART_SCALE);
    this.feet = [-14, 14].map((offset) =>
      this.add.image(offset, -3, "foot").setScale(1 / ART_SCALE).setVisible(false),
    );
    this.sprite = this.add
      .image(0, 0, "student", sheetFrame("down", 0))
      .setOrigin(footX / width, footY / height)
      .setScale(1 / ART_SCALE);
    this.nameLabel = this.add
      .text(0, -132, "", {
        fontFamily: '"Jua", "Gowun Dodum", sans-serif',
        fontSize: "17px",
        color: "#234d4a",
        stroke: "#ffffff",
        strokeThickness: 5,
      })
      .setOrigin(0.5, 1)
      .setResolution(2);

    this.body = this.add.container(this.actor.x, this.actor.y, [shadow, ...this.feet, this.sprite, this.nameLabel]);
    this.body.setDepth(this.actor.y);
  }

  private applyAvatar(image: HTMLImageElement, input: AvatarInput): void {
    const { width, height, footX, footY } = STANDEE_FRAME;
    addCanvasTexture(this, "avatar", paintAvatarStandee(image, input));
    this.appliedAvatar = input;
    this.feet.forEach((foot) => foot.setVisible(true));
    this.sprite.setTexture("avatar").setOrigin(footX / width, footY / height);
  }

  private fitCamera(): void {
    const camera = this.cameras.main;
    const { width, height } = this.scale.gameSize;
    const fit = Math.min(width / WORLD_WIDTH, height / WORLD_HEIGHT);
    camera.setBackgroundColor("#dff1f8");
    camera.stopFollow();
    camera.removeBounds();
    const minZoom = MIN_FIT_ZOOM * this.bridge.pixelRatio;
    if (fit >= minZoom) {
      camera.setZoom(fit);
      camera.centerOn(WORLD_WIDTH / 2, WORLD_HEIGHT / 2);
      return;
    }
    // Too small to show the whole room legibly: fill the height and follow.
    camera.setZoom(Math.max(height / WORLD_HEIGHT, minZoom));
    camera.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    camera.startFollow(this.body, true, 0.14, 0.14);
  }

  update(): void {
    // Phaser's delta is smoothed toward 60fps, which turns a slow device into
    // slow motion. Walking speed has to follow the wall clock.
    const now = performance.now();
    const deltaMs = this.lastFrameAt === null ? 0 : now - this.lastFrameAt;
    this.lastFrameAt = now;

    const previous = this.actor;
    const input = this.paused ? { x: 0, y: 0 } : this.bridge.readInput();
    const next = stepActor(previous, input, deltaMs / 1000, MOVE_WORLD);
    this.actor = next;

    this.body.setPosition(next.x, next.y).setDepth(next.y);
    this.animatePlayer(next, deltaMs);
    this.animateTeacher(deltaMs);
    this.updateNear(next);

    if (next.x !== previous.x || next.y !== previous.y || next.facing !== previous.facing || next.moving !== previous.moving) {
      this.bridge.onActorChange({ ...next });
    }
  }

  private animatePlayer(actor: ActorState, deltaMs: number): void {
    if (actor.moving) {
      this.stepClock += deltaMs;
      while (this.stepClock >= STEP_INTERVAL_MS) {
        this.stepClock -= STEP_INTERVAL_MS;
        this.stepIndex = (this.stepIndex + 1) % 4;
      }
    } else {
      this.stepClock = 0;
      this.stepIndex = 0;
    }
    // Stand, left foot, stand, right foot.
    const pose = [0, 1, 0, -1][this.stepIndex] ?? 0;

    if (this.appliedAvatar) {
      this.sprite.setAngle(actor.moving ? pose * 4 : 0).setY(actor.moving && pose !== 0 ? -3 : 0);
      this.feet.forEach((foot, index) => {
        const lifted = actor.moving && pose === (index === 0 ? 1 : -1);
        foot.setY(lifted ? -8 : -3);
      });
      return;
    }
    this.sprite.setFrame(sheetFrame(actor.facing, pose));
  }

  private animateTeacher(deltaMs: number): void {
    this.blinkClock -= deltaMs;
    if (this.blinkClock > 0) return;
    const closing = this.teacher.frame.name === "open";
    this.teacher.setFrame(closing ? "blink" : "open");
    this.blinkClock = closing ? 130 : 2200 + Math.random() * 2600;
  }

  private updateNear(actor: ActorState): void {
    let best: Interactable | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const item of INTERACTABLES) {
      const distance = distanceToBox(actor, item.zone);
      if (distance <= item.reach && distance < bestDistance) {
        best = item;
        bestDistance = distance;
      }
    }
    const near = this.paused ? null : (best?.id ?? null);
    if (near !== this.near) {
      this.near = near;
      this.bridge.onNearChange(near);
    }
    if (near) {
      const anchor = PROMPT_ANCHOR[near];
      this.prompt
        .setVisible(true)
        .setPosition(anchor.x, anchor.y + Math.sin(this.time.now / 260) * 4);
    } else {
      this.prompt.setVisible(false);
    }
  }
}
