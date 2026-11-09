"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useRef } from "react";
import * as THREE from "three";
import { useAppStore } from "@/shared/state/appStore";
import { ClassroomWorld } from "@/shared/world/ClassroomWorld";
import { QUALITY } from "@/shared/world/quality";

// Framed to keep the teacher on the right and quiet wall behind the headline.
const WIDE = { position: new THREE.Vector3(2.4, 1.5, -0.4), target: new THREE.Vector3(-2.4, 1.45, -4.6) };
const NARROW = { position: new THREE.Vector3(-1.1, 1.3, 0.3), target: new THREE.Vector3(-1.75, 0.95, -3.7) };

function Camera() {
  const { camera, size } = useThree();
  const pointer = useRef({ x: 0, y: 0 });
  const reduced = useRef(false);

  useEffect(() => {
    reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const onMove = (event: PointerEvent) => {
      pointer.current = { x: event.clientX / window.innerWidth - 0.5, y: event.clientY / window.innerHeight - 0.5 };
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  useFrame(() => {
    const view = size.width < 720 ? NARROW : WIDE;
    const px = reduced.current ? 0 : pointer.current.x * 0.12;
    const py = reduced.current ? 0 : pointer.current.y * 0.06;
    camera.position.set(view.position.x + px, view.position.y - py, view.position.z);
    camera.lookAt(view.target);
  });

  return null;
}

export function LandingScene() {
  const quality = useAppStore((state) => state.graphicsQuality);
  return (
    <Canvas dpr={[1, QUALITY[quality].maxDpr]} camera={{ fov: 42, near: 0.1, far: 60 }}>
      <Suspense fallback={null}>
        <ClassroomWorld quality={quality} />
      </Suspense>
      <Camera />
    </Canvas>
  );
}
