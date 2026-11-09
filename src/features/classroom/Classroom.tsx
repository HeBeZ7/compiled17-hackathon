"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Game } from "phaser";
import type { ClassroomProps, ClassroomTarget } from "@/shared/contracts";
import { DirectionPad } from "./DirectionPad";
import { ClassroomInput } from "./input";
import type { ClassroomScene } from "./ClassroomScene";
import type { ActorState, Vec2 } from "./movement";
import styles from "./Classroom.module.css";

const PROMPT_LABEL: Record<ClassroomTarget, string> = {
  teacher: "선생님과 이야기하기",
  study_spot: "학습 자리 살펴보기",
};

/** Shown when the shell enters the room with no agent yet: an explicit development asset. */
const NO_AGENT_NAME = "개발용 임시 캐릭터";

type LoadState = "loading" | "ready" | "failed";

function loadImage(url: string, signal: AbortSignal): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      if (signal.aborted) return;
      if (image.naturalWidth === 0 || image.naturalHeight === 0) {
        reject(new Error("이미지 크기를 읽지 못했습니다."));
      } else {
        resolve(image);
      }
    };
    image.onerror = () => {
      if (!signal.aborted) reject(new Error("이미지를 불러오지 못했습니다."));
    };
    image.src = url;
  });
}

/** Phaser text is drawn once to a canvas, so the font has to be ready first. */
async function waitForLabelFont(): Promise<void> {
  await Promise.race([
    document.fonts.load('17px "Jua"', "가나다").catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, 1200)),
  ]);
}

export function Classroom({ agent, movementLocked, onProximityChange, onInteract }: ClassroomProps) {
  const rootRef = useRef<HTMLElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<ClassroomInput | null>(null);
  const sceneRef = useRef<ClassroomScene | null>(null);
  const nearRef = useRef<ClassroomTarget | null>(null);
  const lockedRef = useRef(movementLocked);
  const onInteractRef = useRef(onInteract);
  const onProximityRef = useRef(onProximityChange);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [near, setNear] = useState<ClassroomTarget | null>(null);
  const [mountNonce, setMountNonce] = useState(0);
  const sceneReadyRef = useRef(false);
  const settledAvatarUrlRef = useRef<string | null | undefined>(undefined);
  const agentRef = useRef(agent);
  const [avatarFailure, setAvatarFailure] = useState<{ url: string; reason: string } | null>(null);

  useEffect(() => {
    onInteractRef.current = onInteract;
    onProximityRef.current = onProximityChange;
    agentRef.current = agent;
  }, [onInteract, onProximityChange, agent]);

  useEffect(() => {
    // Must stay a positive branch: the bundler only drops the import() from this form.
    if (process.env.NEXT_PUBLIC_AA_TEST_MODE === "1") {
      let cancelled = false;
      let uninstall: (() => void) | undefined;
      void import("./testHook").then(({ installClassroomTestHook }) => {
        if (cancelled) return;
        uninstall = installClassroomTestHook({
          scene: () => sceneRef.current,
          sceneReady: () => sceneReadyRef.current,
          settledAvatarUrl: () => settledAvatarUrlRef.current,
          agent: () => agentRef.current,
          paused: () => lockedRef.current,
          remount: () => {
            sceneReadyRef.current = false;
            settledAvatarUrlRef.current = undefined;
            setLoadState("loading");
            setMountNonce((value) => value + 1);
          },
        });
      });
      return () => {
        cancelled = true;
        uninstall?.();
      };
    }
  }, []);

  const fireInteract = useCallback(() => {
    if (lockedRef.current || !nearRef.current) return;
    onInteractRef.current(nearRef.current);
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    const root = rootRef.current;
    if (!host || !root) return;

    let cancelled = false;
    let game: Game | null = null;
    let observer: ResizeObserver | null = null;

    const input = new ClassroomInput(window, { onInteract: fireInteract });
    input.setLocked(lockedRef.current);
    inputRef.current = input;

    // Written straight to the DOM: this runs every moving frame and must not re-render React.
    const publishActor = (actor: ActorState) => {
      root.dataset.playerX = actor.x.toFixed(2);
      root.dataset.playerY = actor.y.toFixed(2);
      root.dataset.facing = actor.facing;
      root.dataset.moving = String(actor.moving);
    };

    void (async () => {
      try {
        const [PhaserModule, sceneModule] = await Promise.all([
          import("phaser"),
          import("./ClassroomScene"),
          waitForLabelFont(),
        ]);
        if (cancelled) return;

        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        const scene = new sceneModule.ClassroomScene({
          pixelRatio,
          readInput: () => input.read(),
          onNearChange: (value) => {
            nearRef.current = value;
            setNear(value);
            onProximityRef.current(value);
          },
          onActorChange: publishActor,
          onReady: () => {
            if (cancelled) return;
            sceneReadyRef.current = true;
            setLoadState("ready");
          },
        });
        sceneRef.current = scene;

        const size = () => ({
          width: Math.max(1, Math.round(host.clientWidth * pixelRatio)),
          height: Math.max(1, Math.round(host.clientHeight * pixelRatio)),
        });
        game = new PhaserModule.Game({
          type: PhaserModule.WEBGL,
          parent: host,
          ...size(),
          backgroundColor: "#dff1f8",
          scale: { mode: PhaserModule.Scale.NONE },
          // Input is DOM-driven; Phaser must not capture keys meant for the chat box.
          input: { keyboard: false, mouse: false, touch: false, gamepad: false },
          banner: false,
          render: { antialias: true, roundPixels: false },
          scene,
        });

        observer = new ResizeObserver(() => {
          const next = size();
          game?.scale.resize(next.width, next.height);
        });
        observer.observe(host);
      } catch (error) {
        if (!cancelled) {
          console.error("classroom failed to start", error);
          setLoadState("failed");
        }
      }
    })();

    return () => {
      cancelled = true;
      observer?.disconnect();
      input.destroy();
      inputRef.current = null;
      sceneRef.current = null;
      sceneReadyRef.current = false;
      nearRef.current = null;
      game?.destroy(true);
      host.replaceChildren();
    };
  }, [fireInteract, mountNonce]);

  useEffect(() => {
    lockedRef.current = movementLocked;
    inputRef.current?.setLocked(movementLocked);
    sceneRef.current?.setPaused(movementLocked);
  }, [movementLocked]);

  // Depends on loadState so an agent that arrived during loading still applies.
  const name = agent ? agent.name : NO_AGENT_NAME;
  useEffect(() => {
    if (loadState !== "ready") return;
    sceneRef.current?.setPaused(lockedRef.current);
    sceneRef.current?.setPlayerName(name);
  }, [name, loadState]);

  const avatarUrl = agent?.avatar?.renderUrl ?? null;
  const avatarKind = agent?.avatar?.inputKind ?? null;
  // Tied to the URL, so choosing a new avatar clears the old failure by itself.
  const avatarError = avatarFailure && avatarFailure.url === avatarUrl ? avatarFailure.reason : null;
  useEffect(() => {
    if (loadState !== "ready") return;
    if (!avatarUrl || !avatarKind) {
      sceneRef.current?.clearAvatar();
      settledAvatarUrlRef.current = null;
      return;
    }
    // Aborting drops a slow load for an avatar that has since been replaced.
    const abort = new AbortController();
    loadImage(avatarUrl, abort.signal)
      .then((image) => {
        if (abort.signal.aborted) return;
        sceneRef.current?.setAvatar(image, avatarKind);
        settledAvatarUrlRef.current = avatarUrl;
      })
      .catch((error: unknown) => {
        if (abort.signal.aborted) return;
        sceneRef.current?.clearAvatar();
        settledAvatarUrlRef.current = avatarUrl;
        setAvatarFailure({
          url: avatarUrl,
          reason: error instanceof Error ? error.message : "외형을 불러오지 못했습니다.",
        });
      });
    return () => abort.abort();
  }, [avatarUrl, avatarKind, loadState]);

  const setPad = useCallback((vector: Vec2) => inputRef.current?.setPad(vector), []);

  return (
    <section
      ref={rootRef}
      className={styles.root}
      aria-label="교실"
      data-testid="classroom"
      data-load-state={loadState}
      data-movement-locked={movementLocked}
      data-near={near ?? ""}
      data-avatar-error={avatarError ?? ""}
    >
      <div ref={hostRef} className={styles.host} />

      {loadState === "loading" && <p className={styles.notice}>교실 문을 여는 중…</p>}
      {loadState === "failed" && (
        <p className={styles.notice} role="alert">
          이 브라우저에서 교실을 그리지 못했습니다. WebGL을 켠 뒤 새로고침해 주세요.
        </p>
      )}

      {loadState === "ready" && (
        <>
          <p className={styles.hint}>방향키 또는 WASD로 걸어보세요</p>
          {avatarError && (
            <p className={styles.avatarError} role="alert">
              내 외형을 불러오지 못해 기본 캐릭터로 표시합니다. {avatarError}
            </p>
          )}
          {/* Remounting on lock drops any in-progress drag and recentres the stick. */}
          <DirectionPad key={String(movementLocked)} disabled={movementLocked} onChange={setPad} />
          {near && !movementLocked && (
            <button type="button" className={styles.prompt} onClick={fireInteract}>
              <kbd className={styles.key}>E</kbd>
              {PROMPT_LABEL[near]}
            </button>
          )}
        </>
      )}
    </section>
  );
}
