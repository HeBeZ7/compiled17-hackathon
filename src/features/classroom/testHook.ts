// Observation hook for the E2E suite. Only ever loaded from the
// NEXT_PUBLIC_AA_TEST_MODE === "1" branch in Classroom.tsx, so it is absent
// from a normal build. Coordinates are layout.ts meters.

import { useAppStore } from "@/shared/state/appStore";
import { BOX_COLLIDERS, CIRCLE_COLLIDERS, ROOM } from "@/shared/world/layout";
import type { AvatarFrameStatus } from "./AvatarFrame";
import type { FirstPersonController } from "./controller";

interface HookSource {
  controller: FirstPersonController;
  /** True once the world has rendered a frame. */
  worldReady: () => boolean;
  avatarFrame: () => AvatarFrameStatus;
  remount: () => void;
}

// Local view of the global. tests/e2e/support owns the typed global declaration.
type TestWindow = { __AA_TEST__?: { classroom?: unknown } };

export function installClassroomTestHook(source: HookSource): () => void {
  const { controller } = source;

  const hook = {
    /** True once the room is drawn and the current agent's picture frame is settled. */
    ready(): boolean {
      const { agentLoad } = useAppStore.getState();
      if (agentLoad !== "ready" && agentLoad !== "failed") return false;
      return source.worldReady() && source.avatarFrame() !== "loading";
    },
    snapshot() {
      return {
        position: { x: controller.x, z: controller.z },
        yaw: controller.yaw,
        pitch: controller.pitch,
        moving: controller.moving,
        paused: controller.locked,
        pointerLocked: controller.pointerLocked,
        target: controller.target,
        world: { ROOM },
        colliders: { boxes: BOX_COLLIDERS, circles: CIRCLE_COLLIDERS },
        avatarFrame: source.avatarFrame(),
      };
    },
    teleport(x: number, z: number, yaw?: number): void {
      controller.teleport(x, z, yaw);
    },
    setLook(yaw: number, pitch: number): void {
      controller.setLook(yaw, pitch);
    },
    remount(): void {
      source.remount();
    },
  };

  const testWindow = window as unknown as TestWindow;
  testWindow.__AA_TEST__ = { ...testWindow.__AA_TEST__, classroom: hook };
  return () => {
    if (testWindow.__AA_TEST__?.classroom === hook) delete testWindow.__AA_TEST__.classroom;
  };
}
