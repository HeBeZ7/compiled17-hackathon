"use client";

import { useAnimations, useGLTF, useTexture } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";

import { SPAWN, TEACHER } from "@/shared/world/layout";
import { QUALITY, type GraphicsQuality } from "@/shared/world/quality";

import { applyBakedLighting, furSheen } from "./ClassroomWorldMaterials";

const BASE = "/assets/classroom";
const ROOM_URL = `${BASE}/classroom.glb`;
const TEACHER_URL = `${BASE}/teacher.glb`;
const LIGHTMAP_URL = `${BASE}/lightmap.webp`;
const ENV_URL = `${BASE}/env_room.webp`;
const BACKDROP_URL = `${BASE}/backdrop_meadow.webp`;

/** The HDR the bake used, turned so the trees fill the window wall. Matches AA_HDR_ROT in build_room.py. */
const BACKDROP_ROTATION = (200 * Math.PI) / 180;

/** Range the lightmap was normalized to in build_room.py, times pi for three's Lambert term. */
const LIGHTMAP_RANGE = 1.6;
const LIGHTMAP_INTENSITY = LIGHTMAP_RANGE * Math.PI;

/**
 * Which generated files are committed in public/assets/classroom. A false entry
 * renders nothing for that part instead of throwing on a missing file.
 */
const ASSETS_READY = { room: true, teacher: false } as const;

export interface ClassroomWorldProps {
  quality: GraphicsQuality;
  greeting?: boolean;
}

function belongsTo(object: THREE.Object3D, name: string): boolean {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (current.name === name) return true;
    current = current.parent;
  }
  return false;
}

function prepareEquirect(texture: THREE.Texture): void {
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;
}

function prepareLightmap(texture: THREE.Texture): void {
  texture.flipY = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.channel = 1;
  texture.anisotropy = 4;
}

function setPlayOnce(action: THREE.AnimationAction): void {
  action.setLoop(THREE.LoopOnce, 1);
  action.clampWhenFinished = false;
}

function usePmrem(texture: THREE.Texture): THREE.Texture {
  const gl = useThree((state) => state.gl);
  const pmrem = useMemo(() => {
    prepareEquirect(texture);
    const generator = new THREE.PMREMGenerator(gl);
    const target = generator.fromEquirectangular(texture);
    generator.dispose();
    return target;
  }, [gl, texture]);
  useEffect(() => () => pmrem.dispose(), [pmrem]);
  return pmrem.texture;
}

function Room({ envMap }: { envMap: THREE.Texture }) {
  const gltf = useGLTF(ROOM_URL, false, true);
  const lightmap = useTexture(LIGHTMAP_URL);

  const room = useMemo(() => {
    prepareLightmap(lightmap);
    gltf.scene.traverse((child) => {
      if (!(child as THREE.Mesh).isMesh) return;
      const mesh = child as THREE.Mesh;
      const material = mesh.material as THREE.MeshStandardMaterial;
      material.toneMapped = false;
      material.envMap = envMap;
      if (belongsTo(mesh, "ClassroomGlass")) {
        material.transparent = true;
        material.opacity = 0.12;
        material.roughness = 0.03;
        material.metalness = 0;
        material.depthWrite = false;
        material.envMapIntensity = 1.3;
        return;
      }
      if (belongsTo(mesh, "ClassroomStatic")) {
        material.lightMap = lightmap;
        material.lightMapIntensity = LIGHTMAP_INTENSITY;
        material.envMapIntensity = 0.45;
        applyBakedLighting(material);
      } else {
        material.envMapIntensity = 0.8;
      }
      mesh.frustumCulled = false;
    });
    return gltf.scene;
  }, [gltf.scene, lightmap, envMap]);

  return <primitive object={room} />;
}

/** Sky and trees outside the window wall. Unlit, drawn behind the room. */
function Backdrop() {
  const texture = useTexture(BACKDROP_URL, (loaded) => {
    const map = loaded as THREE.Texture;
    map.colorSpace = THREE.SRGBColorSpace;
    map.mapping = THREE.UVMapping;
  });
  return (
    <mesh rotation-y={BACKDROP_ROTATION}>
      <sphereGeometry args={[46, 48, 24]} />
      <meshBasicMaterial map={texture} side={THREE.BackSide} toneMapped={false} fog={false} depthWrite={false} />
    </mesh>
  );
}

function Teacher({ envMap, quality, greeting }: { envMap: THREE.Texture; quality: GraphicsQuality; greeting: boolean }) {
  const gltf = useGLTF(TEACHER_URL, false, true);
  const settings = QUALITY[quality];
  const lite = settings.detail < 0.6;

  const scene = useMemo(() => {
    const copy = cloneSkinned(gltf.scene);
    copy.traverse((child) => {
      if (!(child as THREE.Mesh).isMesh) return;
      const mesh = child as THREE.Mesh;
      mesh.castShadow = settings.shadows;
      mesh.receiveShadow = settings.shadows;
      mesh.frustumCulled = false;
      const material = mesh.material as THREE.MeshStandardMaterial;
      const next = !lite && material.name === "teacher_fur_final" ? furSheen(material) : material.clone();
      next.toneMapped = false;
      next.envMap = envMap;
      next.envMapIntensity = next.name.includes("fur") ? 0.9 : 1.05;
      mesh.material = next;
    });
    return copy;
  }, [gltf.scene, envMap, settings.shadows, lite]);

  const { actions, mixer } = useAnimations(gltf.animations, scene);

  useEffect(() => {
    actions.idle?.reset().fadeIn(0.3).play();
    for (const name of ["blink", "ears"] as const) {
      const action = actions[name];
      if (action) setPlayOnce(action);
    }
    return () => {
      mixer.stopAllAction();
    };
  }, [actions, mixer]);

  const nextBlink = useRef(2.0);
  const nextEar = useRef(5.0);
  useFrame((_, delta) => {
    nextBlink.current -= delta;
    nextEar.current -= delta;
    if (nextBlink.current <= 0) {
      nextBlink.current = 2.2 + Math.random() * 3.2;
      actions.blink?.reset().play();
    }
    if (nextEar.current <= 0) {
      nextEar.current = 6 + Math.random() * 8;
      actions.ears?.reset().play();
    }
  });

  useEffect(() => {
    const greet = actions.greet;
    const idle = actions.idle;
    if (!greet || !greeting) return;
    setPlayOnce(greet);
    idle?.fadeOut(0.25);
    greet.reset().fadeIn(0.25).play();
    const onFinished = (event: { action: THREE.AnimationAction }) => {
      if (event.action !== greet) return;
      greet.fadeOut(0.3);
      idle?.reset().fadeIn(0.3).play();
    };
    mixer.addEventListener("finished", onFinished);
    return () => {
      mixer.removeEventListener("finished", onFinished);
      greet.fadeOut(0.2);
      idle?.fadeIn(0.2).play();
    };
  }, [actions, greeting, mixer]);

  const yaw = Math.atan2(SPAWN.x - TEACHER.x, SPAWN.z - TEACHER.z);

  return <primitive object={scene} position={[TEACHER.x, 0, TEACHER.z]} rotation-y={yaw} />;
}

function WorldContent({ quality, greeting }: { quality: GraphicsQuality; greeting: boolean }) {
  const envSource = useTexture(ENV_URL);
  const envMap = usePmrem(envSource);
  const settings = QUALITY[quality];
  return (
    <group>
      <Room envMap={envMap} />
      <Backdrop />
      {ASSETS_READY.teacher ? <Teacher envMap={envMap} quality={quality} greeting={greeting} /> : null}
      {/* The room is fully baked: these lights only shade the teacher and props. */}
      <hemisphereLight args={["#ffffff", "#e8ddd0", 0.35]} />
      <directionalLight
        castShadow={settings.shadows}
        color="#fff5ea"
        intensity={0.9}
        position={[-4.5, 4.5, -0.5]}
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-2}
        shadow-camera-right={2}
        shadow-camera-top={2}
        shadow-camera-bottom={-2}
        shadow-camera-far={12}
        shadow-bias={-0.0005}
        shadow-normalBias={0.02}
      />
    </group>
  );
}

/**
 * The room slice from the entrance view: baked shell and desk, the teacher, the view
 * outside the windows and the few real-time lights. Mount under any Canvas; this
 * component owns no camera, controls or Canvas of its own.
 */
export function ClassroomWorld({ quality, greeting = false }: ClassroomWorldProps) {
  if (!ASSETS_READY.room) return null;
  return (
    <Suspense fallback={null}>
      <WorldContent quality={quality} greeting={greeting} />
    </Suspense>
  );
}

export function preloadClassroomWorld(): void {
  if (!ASSETS_READY.room) return;
  useGLTF.preload(ROOM_URL, false, true);
  if (ASSETS_READY.teacher) useGLTF.preload(TEACHER_URL, false, true);
  useTexture.preload(LIGHTMAP_URL);
  useTexture.preload(ENV_URL);
  useTexture.preload(BACKDROP_URL);
}
