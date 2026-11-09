"use client";

// Three.js objects are mutated in effects and the frame loop by design: that is how R3F animates without re-rendering.
/* eslint-disable react-hooks/immutability */

import { useGLTF, useTexture } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, type MutableRefObject } from "react";
import * as THREE from "three";
import { QUALITY, type GraphicsQuality } from "@/shared/world/quality";
import {
  createBakedMaterial,
  createGlassMaterial,
  createJellyMaterial,
  createJellyUniforms,
  radialTexture,
} from "./materials";

const URLS = {
  set: "/assets/showroom/conservatory.glb",
  plinth: "/assets/showroom/display-plinth.glb",
  qwen: "/assets/showroom/qwen-star.glb",
  environment: "/assets/showroom/environment.webp",
} as const;

export type DisplayState = "idle" | "hover" | "selected";

export interface ShowroomCanvasProps {
  displayState: DisplayState;
  quality: GraphicsQuality;
  reducedMotion: boolean;
  onDisplayFocus: () => void;
  onHoverChange: (hovering: boolean) => void;
  /** Reports the projected top of the plinth label, for the DOM label layer. */
  labelAnchor: MutableRefObject<HTMLDivElement | null>;
}

const DISPLAY_LABEL_POINT = new THREE.Vector3(0, 0.82, 1.5);

/** Keeps every asset unlit and baked so the room stays cheap and soft. */
function Conservatory() {
  const { scene } = useGLTF(URLS.set, false, true);
  useEffect(() => {
    scene.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      const source = node.material as THREE.MeshStandardMaterial;
      node.material = node.name.includes("decor")
        ? createBakedMaterial(null, { vertexColors: true, side: THREE.DoubleSide })
        : createBakedMaterial(source.map);
      node.frustumCulled = true;
    });
  }, [scene]);
  return <primitive object={scene} />;
}

/** Sky beyond the glass: painted once on a canvas and placed far outside the windows. */
function Sky() {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 512;
    const context = canvas.getContext("2d");
    if (context) {
      const gradient = context.createLinearGradient(0, 0, 0, 512);
      gradient.addColorStop(0, "#9fd0f2");
      gradient.addColorStop(0.65, "#d4ecf8");
      gradient.addColorStop(1, "#eef8fb");
      context.fillStyle = gradient;
      context.fillRect(0, 0, 1024, 512);
      context.filter = "blur(26px)";
      context.fillStyle = "rgba(255,255,255,0.86)";
      for (const [x, y, rx, ry] of [
        [180, 150, 170, 44],
        [430, 95, 120, 30],
        [720, 170, 190, 50],
        [930, 110, 110, 30],
        [560, 230, 150, 32],
      ] as const) {
        context.beginPath();
        context.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
        context.fill();
      }
    }
    const result = new THREE.CanvasTexture(canvas);
    result.colorSpace = THREE.SRGBColorSpace;
    return result;
  }, []);
  return (
    <mesh position={[0, 20, -60]}>
      <planeGeometry args={[220, 100]} />
      <meshBasicMaterial map={texture} toneMapped={false} depthWrite={false} />
    </mesh>
  );
}

function EnvironmentMap() {
  const texture = useTexture(URLS.environment);
  const { scene } = useThree();
  useEffect(() => {
    texture.mapping = THREE.EquirectangularReflectionMapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    scene.environment = texture;
    scene.environmentIntensity = 1;
    return () => {
      scene.environment = null;
    };
  }, [scene, texture]);
  return null;
}

/** Eases a value toward a target, independent of frame rate. */
function damp(current: number, target: number, rate: number, delta: number): number {
  return THREE.MathUtils.damp(current, target, rate, delta);
}

function QwenCharacter({ state, transmission, reducedMotion }: { state: DisplayState; transmission: boolean; reducedMotion: boolean }) {
  const { scene } = useGLTF(URLS.qwen, false, true);
  const root = useRef<THREE.Group>(null);
  const ringPivot = useRef<THREE.Group>(null);
  const uniforms = useMemo(() => createJellyUniforms(), []);
  const activity = useRef(0);
  const hop = useRef(0);
  const previousState = useRef(state);

  const model = useMemo(() => {
    const clone = scene.clone(true);
    const jelly = createJellyMaterial(uniforms, transmission);
    const glossy = new THREE.MeshPhysicalMaterial({ color: "#20123f", roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.4 });
    const highlight = new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: false });
    const mouth = new THREE.MeshPhysicalMaterial({ color: "#8b2150", roughness: 0.3, clearcoat: 0.7 });
    const tongue = new THREE.MeshPhysicalMaterial({ color: "#ff7c94", roughness: 0.35, clearcoat: 0.5 });
    const cheek = new THREE.MeshBasicMaterial({ color: "#ffb3dc", transparent: true, opacity: 0.55, depthWrite: false });
    const star = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.0, 1.25), toneMapped: false });
    const ribbon = new THREE.MeshPhysicalMaterial({
      color: "#c9b0ff",
      roughness: 0.12,
      clearcoat: 1,
      transparent: true,
      opacity: 0.62,
      envMapIntensity: 1.4,
      emissive: new THREE.Color("#7a55d8"),
      emissiveIntensity: 0.28,
      depthWrite: false,
    });
    const ringNodes: THREE.Object3D[] = [];
    clone.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      const name = (node.material as THREE.Material).name;
      if (name === "jelly_body") node.material = jelly;
      else if (name === "eye") node.material = glossy;
      else if (name === "eye_highlight") node.material = highlight;
      else if (name === "mouth") node.material = mouth;
      else if (name === "tongue") node.material = tongue;
      else if (name === "cheek") node.material = cheek;
      else if (name === "core_star") node.material = star;
      else if (name === "orbit_ring") {
        node.material = ribbon;
        node.renderOrder = 3;
      }
      if (node.name === "orbit_ring" || node.name === "ring_star") ringNodes.push(node);
    });
    return { clone, ringNodes };
  }, [scene, uniforms, transmission]);

  useEffect(() => {
    if (!ringPivot.current) return;
    const pivot = ringPivot.current;
    for (const node of model.ringNodes) pivot.add(node);
  }, [model]);

  useFrame((frame, delta) => {
    const time = reducedMotion ? 0 : frame.clock.elapsedTime;
    const target = state === "selected" ? 1 : state === "hover" ? 0.45 : 0;
    activity.current = damp(activity.current, target, 3.2, delta);
    uniforms.uTime.value = time;
    uniforms.uGlow.value = activity.current;
    if (previousState.current !== state) {
      if (state === "selected" && !reducedMotion) hop.current = 1;
      previousState.current = state;
    }
    hop.current = damp(hop.current, 0, 2.6, delta);
    if (!root.current) return;
    const breathe = Math.sin(time * 1.25);
    const bob = 0.022 * breathe + Math.sin(time * 6) * 0.05 * hop.current;
    root.current.position.y = bob + hop.current * 0.1;
    root.current.scale.set(1 - breathe * 0.008, 1 + breathe * 0.012, 1 - breathe * 0.008);
    root.current.rotation.y = Math.sin(time * 0.42) * 0.07;
    if (ringPivot.current) ringPivot.current.rotation.y = reducedMotion ? 0.6 : time * (0.32 + activity.current * 0.5);
  });

  return (
    <group ref={root}>
      <primitive object={model.clone} />
      <group ref={ringPivot} position={[0, 1.04, 0]} rotation={[0.28, 0, -0.2]} />
    </group>
  );
}

function Display({ state, transmission, reducedMotion, onDisplayFocus, onHoverChange, labelAnchor }: {
  state: DisplayState;
  transmission: boolean;
  reducedMotion: boolean;
  onDisplayFocus: () => void;
  onHoverChange: (hovering: boolean) => void;
  labelAnchor: ShowroomCanvasProps["labelAnchor"];
}) {
  const { scene } = useGLTF(URLS.plinth, false, true);
  const glow = useRef(0);
  const projected = useMemo(() => new THREE.Vector3(), []);
  const parts = useMemo(() => {
    const clone = scene.clone(true);
    const glowMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color("#7fe3be"), toneMapped: false });
    const front = createGlassMaterial(THREE.FrontSide, 1);
    const back = createGlassMaterial(THREE.BackSide, 0.7);
    let domeMesh: THREE.Mesh | null = null;
    clone.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      const source = node.material as THREE.MeshStandardMaterial;
      if (node.name.startsWith("glow_ring")) node.material = glowMaterial;
      else if (node.name.startsWith("dome_rim")) {
        node.material = new THREE.MeshPhysicalMaterial({ color: "#f4efe3", roughness: 0.22, metalness: 0.3, envMapIntensity: 1.3 });
      } else if (node.name === "dome") {
        node.material = front;
        node.renderOrder = 5;
        domeMesh = node;
      } else {
        // Baked diffuse as emissive, with a thin dielectric sheen on top.
        const sheen = new THREE.MeshStandardMaterial({
          color: "#000000",
          emissive: "#ffffff",
          emissiveMap: source.map ?? null,
          emissiveIntensity: 1,
          roughness: 0.36,
          metalness: 0,
          envMapIntensity: 0.55,
        });
        if (sheen.emissiveMap) sheen.emissiveMap.colorSpace = THREE.SRGBColorSpace;
        node.material = sheen;
      }
    });
    let domeBack: THREE.Mesh | null = null;
    if (domeMesh) {
      const original = domeMesh as THREE.Mesh;
      domeBack = new THREE.Mesh(original.geometry, back);
      domeBack.position.copy(original.position);
      domeBack.renderOrder = 4;
    }
    return { clone, domeBack, glowMaterial };
  }, [scene]);

  const contact = useMemo(
    () => radialTexture([[0, "rgba(64,84,92,0.46)"], [0.55, "rgba(64,84,92,0.22)"], [1, "rgba(64,84,92,0)"]]),
    [],
  );
  const pool = useMemo(
    () => radialTexture([[0, "rgba(186,150,255,0.8)"], [0.5, "rgba(174,146,255,0.25)"], [1, "rgba(160,140,255,0)"]]),
    [],
  );
  const poolRef = useRef<THREE.Mesh>(null);
  const beamRef = useRef<THREE.Mesh>(null);

  useFrame((frame, delta) => {
    const target = state === "selected" ? 1 : state === "hover" ? 0.5 : 0.18;
    glow.current = damp(glow.current, target, 3.2, delta);
    const pulse = reducedMotion ? 0 : Math.sin(frame.clock.elapsedTime * 2.1) * 0.08;
    const lift = 1 + glow.current * 1.4 + pulse * glow.current;
    parts.glowMaterial.color.setRGB(0.5 * lift, 0.92 * lift, 0.76 * lift);
    if (poolRef.current) (poolRef.current.material as THREE.MeshBasicMaterial).opacity = 0.3 + glow.current * 0.65;
    if (beamRef.current) (beamRef.current.material as THREE.MeshBasicMaterial).opacity = glow.current * 0.26;
    if (labelAnchor.current) {
      projected.copy(DISPLAY_LABEL_POINT).project(frame.camera);
      const { width, height } = frame.size;
      labelAnchor.current.style.transform = `translate(-50%, -50%) translate(${((projected.x + 1) / 2) * width}px, ${((1 - projected.y) / 2) * height}px)`;
    }
  });

  return (
    <group
      onClick={(event) => {
        event.stopPropagation();
        onDisplayFocus();
      }}
      onPointerOver={(event) => {
        event.stopPropagation();
        onHoverChange(true);
      }}
      onPointerOut={() => onHoverChange(false)}
    >
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.348, 0]} scale={4.6}>
        <planeGeometry />
        <meshBasicMaterial map={contact} transparent depthWrite={false} toneMapped={false} />
      </mesh>
      <primitive object={parts.clone} />
      {parts.domeBack && <primitive object={parts.domeBack} />}
      <mesh ref={poolRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 1.655, 0]} scale={3.4} renderOrder={2}>
        <planeGeometry />
        <meshBasicMaterial map={pool} transparent depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh ref={beamRef} position={[0, 3.5, 0]} renderOrder={6}>
        <cylinderGeometry args={[1.05, 1.62, 3.8, 48, 1, true]} />
        <meshBasicMaterial color="#d8c7ff" transparent opacity={0} side={THREE.DoubleSide} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </mesh>
      <group position={[0, 1.65, 0]} scale={0.92}>
        <QwenCharacter state={state} transmission={transmission} reducedMotion={reducedMotion} />
      </group>
      <directionalLight position={[3, 7, 6]} intensity={1.8} color="#ffffff" />
      <directionalLight position={[-5, 4, 5]} intensity={0.9} color="#e8f2ff" />
    </group>
  );
}

/** Narrow screens keep the display wide enough by widening the vertical field of view. */
function ResponsiveCamera() {
  const { camera, size } = useThree();
  useEffect(() => {
    const perspective = camera as THREE.PerspectiveCamera;
    const aspect = size.width / size.height;
    const narrow = aspect < 1;
    perspective.position.set(0, narrow ? 3.3 : 2.75, narrow ? 15.5 : 11.4);
    perspective.fov = narrow ? 34 : 24;
    perspective.lookAt(0, narrow ? 2.5 : 1.9, 0);
    perspective.updateProjectionMatrix();
  }, [camera, size]);
  return null;
}

export default function ShowroomCanvas(props: ShowroomCanvasProps) {
  const settings = QUALITY[props.quality];
  return (
    <Canvas
      dpr={[1, settings.maxDpr]}
      camera={{ position: [0, 2.75, 11.4], fov: 24 }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.NeutralToneMapping;
        gl.toneMappingExposure = 1;
      }}
      style={{ position: "absolute", inset: 0 }}
      aria-hidden="true"
    >
      <color attach="background" args={["#eef6fa"]} />
      <ResponsiveCamera />
      <Suspense fallback={null}>
        <EnvironmentMap />
        <Sky />
        <Conservatory />
        <Display
          state={props.displayState}
          transmission={props.quality !== "low"}
          reducedMotion={props.reducedMotion}
          onDisplayFocus={props.onDisplayFocus}
          onHoverChange={props.onHoverChange}
          labelAnchor={props.labelAnchor}
        />
      </Suspense>
    </Canvas>
  );
}

useGLTF.preload(URLS.set, false, true);
useGLTF.preload(URLS.plinth, false, true);
useGLTF.preload(URLS.qwen, false, true);
