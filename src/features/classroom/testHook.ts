// Observation hook for the E2E suite. Only ever loaded from the
// NEXT_PUBLIC_AA_TEST_MODE === "1" branch in Classroom.tsx, so it is absent
// from a normal build. Coordinates use the footprint's top-left corner.

import type { AgentProfile } from "@/shared/contracts";
import { useAppStore } from "@/shared/state/appStore";
import type { ClassroomScene } from "./ClassroomScene";
import { MOVE_WORLD, TEACHER_COLLIDER, WORLD_HEIGHT, WORLD_WIDTH } from "./world";

type HookSource = {
  scene: () => ClassroomScene | null;
  sceneReady: () => boolean;
  /** undefined until the first avatar decision; null when settled on no avatar. */
  settledAvatarUrl: () => string | null | undefined;
  agent: () => AgentProfile | null;
  paused: () => boolean;
  remount: () => void;
};

declare global {
  interface Window {
    __AA_TEST__?: { classroom?: unknown };
  }
}

export function installClassroomTestHook(source: HookSource): () => void {
  const { halfW, halfH } = MOVE_WORLD.footprint;

  const hook = {
    /** True once the room is drawn and the current agent's avatar is settled. */
    ready(): boolean {
      const store = useAppStore.getState();
      if (store.agentLoad !== "ready" && store.agentLoad !== "failed") return false;
      if (!source.sceneReady()) return false;
      return source.settledAvatarUrl() === (store.agent?.avatar?.renderUrl ?? null);
    },
    snapshot() {
      const view = source.scene()?.inspect();
      if (!view) throw new Error("classroom scene is not running");
      const agent = source.agent();
      return {
        footprint: { x: view.actor.x - halfW, y: view.actor.y - halfH, w: halfW * 2, h: halfH * 2 },
        world: { w: WORLD_WIDTH, h: WORLD_HEIGHT },
        obstacles: MOVE_WORLD.obstacles,
        teacher: { x: TEACHER_COLLIDER.x, y: TEACHER_COLLIDER.y },
        moving: view.actor.moving,
        paused: source.paused(),
        screen: view.playerScreen,
        agent: {
          agentId: agent?.agentId ?? null,
          selectedModelId: agent?.selectedModel?.modelId ?? null,
          avatarSource: view.avatarSource,
        },
      };
    },
    teleport(x: number, y: number): void {
      source.scene()?.teleport({ x: x + halfW, y: y + halfH });
    },
    remount(): void {
      source.remount();
    },
  };

  window.__AA_TEST__ = { ...window.__AA_TEST__, classroom: hook };
  return () => {
    if (window.__AA_TEST__?.classroom === hook) delete window.__AA_TEST__.classroom;
  };
}
