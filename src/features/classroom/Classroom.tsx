"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { ClassroomProps, ClassroomTarget } from "@/shared/contracts";
import { useAppStore } from "@/shared/state/appStore";
import { detectWebGL } from "@/shared/world/quality";
import type { AvatarFrameStatus } from "./AvatarFrame";
import { ClassroomCanvas } from "./ClassroomCanvas";
import { FirstPersonController } from "./controller";
import { Hud, MyAgentPill } from "./Hud";
import { LookZone, MoveStick } from "./TouchControls";
import styles from "./Classroom.module.css";

const TOUCH_ONLY_QUERY = "(hover: none) and (pointer: coarse)";

function subscribeTouchOnly(notify: () => void): () => void {
  const media = window.matchMedia(TOUCH_ONLY_QUERY);
  media.addEventListener("change", notify);
  return () => media.removeEventListener("change", notify);
}

function useTouchOnly(): boolean {
  return useSyncExternalStore(
    subscribeTouchOnly,
    () => window.matchMedia(TOUCH_ONLY_QUERY).matches,
    () => false,
  );
}

function Fallback({ agent, onInteract }: Pick<ClassroomProps, "agent" | "onInteract">) {
  return (
    <div className={styles.fallback} data-testid="classroom-fallback">
      <MyAgentPill agent={agent} />
      <h2 className={styles.fallbackTitle}>The 3D classroom cannot run on this device</h2>
      <p>You can still talk to your teacher and open the learning station</p>
      <div className={styles.fallbackActions}>
        <button type="button" className={styles.fallbackButton} onClick={() => onInteract("teacher")}>
          Talk to your teacher
        </button>
        <button type="button" className={styles.fallbackButton} onClick={() => onInteract("study_spot")}>
          Open learning station
        </button>
      </div>
    </div>
  );
}

function ClassroomSession({
  agent,
  movementLocked,
  onProximityChange,
  onInteract,
  onRemount,
}: ClassroomProps & { onRemount: () => void }) {
  const [controller] = useState(() => new FirstPersonController());
  const [webglAvailable] = useState(detectWebGL);
  const [rendererFailed, setRendererFailed] = useState(false);
  const [worldReady, setWorldReady] = useState(false);
  const [target, setTarget] = useState<ClassroomTarget | null>(null);
  const [pointerLocked, setPointerLocked] = useState(false);
  const [lookFailed, setLookFailed] = useState(false);
  const [settledAvatar, setSettledAvatar] = useState<{ url: string; status: "loaded" | "failed" } | null>(null);
  const quality = useAppStore((state) => state.graphicsQuality);
  const setGraphicsQuality = useAppStore((state) => state.setGraphicsQuality);
  const touchOnly = useTouchOnly();

  const avatarUrl = agent?.avatar?.renderUrl ?? null;
  const frameStatus: AvatarFrameStatus = !avatarUrl
    ? "none"
    : settledAvatar?.url === avatarUrl
      ? settledAvatar.status
      : "loading";

  useEffect(() => {
    controller.setCallbacks({
      onInteract,
      onTargetChange: (next) => {
        setTarget(next);
        onProximityChange(next);
      },
      onPointerLockChange: (locked) => {
        setPointerLocked(locked);
        if (locked) setLookFailed(false);
      },
      onLookFailed: () => setLookFailed(true),
    });
  }, [controller, onInteract, onProximityChange]);

  useEffect(() => {
    controller.start();
    return () => controller.stop();
  }, [controller]);

  useEffect(() => {
    controller.setLocked(movementLocked);
  }, [controller, movementLocked]);

  const observed = useRef({ worldReady, frameStatus });
  useEffect(() => {
    observed.current = { worldReady, frameStatus };
  }, [worldReady, frameStatus]);

  useEffect(() => {
    // Must stay a positive branch: the bundler only drops the import() from this form.
    if (process.env.NEXT_PUBLIC_AA_TEST_MODE === "1") {
      let cancelled = false;
      let uninstall: (() => void) | undefined;
      void import("./testHook").then(({ installClassroomTestHook }) => {
        if (cancelled) return;
        uninstall = installClassroomTestHook({
          controller,
          worldReady: () => observed.current.worldReady,
          avatarFrame: () => observed.current.frameStatus,
          remount: onRemount,
        });
      });
      return () => {
        cancelled = true;
        uninstall?.();
      };
    }
  }, [controller, onRemount]);

  const handleReady = useCallback(() => setWorldReady(true), []);
  const handleFail = useCallback(() => setRendererFailed(true), []);
  const handleAvatarStatus = useCallback(
    (url: string, status: "loaded" | "failed") => setSettledAvatar({ url, status }),
    [],
  );

  if (!webglAvailable || rendererFailed) {
    return (
      <section className={styles.root} aria-label="Classroom" data-testid="classroom" data-load-state="failed">
        <Fallback agent={agent} onInteract={onInteract} />
      </section>
    );
  }

  const loadState = worldReady ? "ready" : "loading";
  const showTouchControls = touchOnly && worldReady;
  const showLookZone = worldReady && (touchOnly || (lookFailed && !pointerLocked));

  return (
    <section
      className={styles.root}
      aria-label="Classroom"
      data-testid="classroom"
      data-load-state={loadState}
      data-movement-locked={movementLocked}
      data-pointer-locked={pointerLocked}
      data-near={target ?? ""}
      data-avatar-frame={frameStatus}
    >
      <div className={styles.host}>
        <ClassroomCanvas
          controller={controller}
          quality={quality}
          avatarUrl={avatarUrl}
          onReady={handleReady}
          onFail={handleFail}
          onAvatarStatus={handleAvatarStatus}
        />
      </div>

      {!worldReady && <p className={styles.notice}>Opening the classroom</p>}

      {showLookZone && <LookZone controller={controller} disabled={movementLocked} />}
      {showTouchControls && <MoveStick controller={controller} disabled={movementLocked} />}

      <Hud
        agent={agent}
        ready={worldReady}
        touchOnly={touchOnly}
        movementLocked={movementLocked}
        pointerLocked={pointerLocked}
        lookFailed={lookFailed}
        target={target}
        quality={quality}
        frameStatus={frameStatus}
        onRequestLook={() => controller.requestLook()}
        onInteract={() => controller.interact()}
        onQualityChange={setGraphicsQuality}
      />
    </section>
  );
}

export function Classroom(props: ClassroomProps) {
  const [mountNonce, setMountNonce] = useState(0);
  const remount = useCallback(() => setMountNonce((value) => value + 1), []);
  return <ClassroomSession key={mountNonce} {...props} onRemount={remount} />;
}
