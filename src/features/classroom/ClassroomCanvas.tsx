"use client";

import { Component, Suspense, useEffect, useRef, type ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import type { Object3D, PerspectiveCamera } from "three";
import { ClassroomWorld } from "@/shared/world/ClassroomWorld";
import { PLAYER, SPAWN } from "@/shared/world/layout";
import { QUALITY, type GraphicsQuality } from "@/shared/world/quality";
import { AvatarFrame } from "./AvatarFrame";
import { TemporaryFurniture } from "./TemporaryFurniture";
import type { FirstPersonController } from "./controller";
import { verticalFovForAspect } from "./movement";

/** Drives the camera from the controller once per rendered frame. */
function FirstPersonRig({ controller }: { controller: FirstPersonController }) {
  const canvas = useThree((state) => state.gl.domElement);

  useEffect(() => {
    controller.attachCanvas(canvas);
    return () => controller.attachCanvas(null);
  }, [controller, canvas]);

  useFrame((state, delta) => {
    controller.update(delta);
    const camera = state.camera as PerspectiveCamera;
    camera.position.set(controller.x, PLAYER.eyeHeight, controller.z);
    camera.rotation.set(controller.pitch, controller.yaw, 0, "YXZ");
    const fov = verticalFovForAspect(state.size.width / state.size.height);
    if (camera.fov !== fov) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
  });

  return null;
}

function containsMesh(object: Object3D): boolean {
  let found = false;
  object.traverse((child) => {
    if ((child as { isMesh?: boolean }).isMesh) found = true;
  });
  return found;
}

/**
 * ClassroomWorld keeps its own Suspense boundary, so readiness is taken from the
 * scene: the world commits all at once, and overlays mark themselves notWorld.
 */
function ReadySignal({ onReady }: { onReady: () => void }) {
  const fired = useRef(false);
  useFrame((state) => {
    if (fired.current) return;
    if (!state.scene.children.some((child) => !child.userData.notWorld && containsMesh(child))) return;
    fired.current = true;
    onReady();
  });
  return null;
}

class CanvasBoundary extends Component<{ onFail: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error("classroom renderer failed", error);
    this.props.onFail();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function ClassroomCanvas({
  controller,
  quality,
  avatarUrl,
  onReady,
  onFail,
  onAvatarStatus,
}: {
  controller: FirstPersonController;
  quality: GraphicsQuality;
  avatarUrl: string | null;
  onReady: () => void;
  onFail: () => void;
  onAvatarStatus: (url: string, status: "loaded" | "failed") => void;
}) {
  const settings = QUALITY[quality];
  return (
    <CanvasBoundary onFail={onFail}>
      <Canvas
        // R3F disposes the renderer and observes this element's size for resize.
        dpr={[1, settings.maxDpr]}
        shadows={settings.shadows}
        resize={{ scroll: false }}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        camera={{ fov: 62, near: 0.05, far: 60, position: [SPAWN.x, PLAYER.eyeHeight, SPAWN.z] }}
      >
        <FirstPersonRig controller={controller} />
        <Suspense fallback={null}>
          <ClassroomWorld quality={quality} />
          <TemporaryFurniture />
          {avatarUrl && <AvatarFrame url={avatarUrl} onStatus={onAvatarStatus} />}
          <ReadySignal onReady={onReady} />
        </Suspense>
      </Canvas>
    </CanvasBoundary>
  );
}
