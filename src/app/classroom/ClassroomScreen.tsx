"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { LearningPanel } from "@/features/learning";
import { TeacherPanel } from "@/features/teacher";
import type { ClassroomTarget } from "@/shared/contracts";
import { selectMovementLocked, useAppStore } from "@/shared/state/appStore";
import { ButtonLink, ConnectionNotice, StatusBadge } from "@/shared/ui";
import styles from "./ClassroomScreen.module.css";

// The game engine touches browser globals, so it must never run during server rendering.
const Classroom = dynamic(() => import("@/features/classroom").then((module) => module.Classroom), {
  ssr: false,
  loading: () => <p role="status">교실을 여는 중입니다.</p>,
});

const PROXIMITY_HINT: Record<ClassroomTarget, string> = {
  teacher: "선생님 곁에 있어요. 말을 걸 수 있습니다.",
  study_spot: "학습 자리 곁에 있어요.",
};

function isTextInput(element: Element | null): boolean {
  return (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement ||
    (element instanceof HTMLElement && element.isContentEditable)
  );
}

export function ClassroomScreen() {
  const agent = useAppStore((state) => state.agent);
  const agentLoad = useAppStore((state) => state.agentLoad);
  const agentError = useAppStore((state) => state.agentError);
  const overlay = useAppStore((state) => state.overlay);
  const movementLocked = useAppStore(selectMovementLocked);
  const loadAgent = useAppStore((state) => state.loadAgent);
  const openOverlay = useAppStore((state) => state.openOverlay);
  const closeOverlay = useAppStore((state) => state.closeOverlay);
  const setTextInputFocused = useAppStore((state) => state.setTextInputFocused);
  const [nearby, setNearby] = useState<ClassroomTarget | null>(null);

  useEffect(() => {
    if (useAppStore.getState().agentLoad !== "ready") void loadAgent();
  }, [loadAgent]);

  useEffect(() => {
    const syncFocus = () => setTextInputFocused(isTextInput(document.activeElement));
    document.addEventListener("focusin", syncFocus);
    document.addEventListener("focusout", syncFocus);
    return () => {
      document.removeEventListener("focusin", syncFocus);
      document.removeEventListener("focusout", syncFocus);
      setTextInputFocused(false);
      closeOverlay();
    };
  }, [setTextInputFocused, closeOverlay]);

  return (
    <main className={styles.main}>
      <div className={styles.status}>
        {agent ? (
          <>
            <p>
              <strong>{agent.name}</strong>
              <span className={styles.model}>{agent.selectedModel?.modelId ?? "모델 미선택"}</span>
            </p>
            <ButtonLink href="/create" variant="secondary">
              모델·외형 바꾸기
            </ButtonLink>
          </>
        ) : agentLoad === "ready" ? (
          <>
            <StatusBadge tone="unknown">에이전트 없이 둘러보는 중</StatusBadge>
            <ButtonLink href="/create" variant="secondary">
              에이전트 만들기
            </ButtonLink>
          </>
        ) : null}
        <p className={styles.hint} role="status">
          {nearby ? PROXIMITY_HINT[nearby] : ""}
        </p>
      </div>

      {agentLoad === "failed" && agentError && <ConnectionNotice error={agentError} onRetry={() => void loadAgent()} />}

      <Classroom
        agent={agent}
        movementLocked={movementLocked}
        onProximityChange={setNearby}
        onInteract={(target) => openOverlay(target === "teacher" ? "teacher" : "learning")}
      />

      {overlay !== "none" && (
        <div className={styles.overlay}>
          {overlay === "teacher" ? (
            <TeacherPanel agent={agent} onClose={closeOverlay} onOpenLearning={() => openOverlay("learning")} />
          ) : (
            <LearningPanel agent={agent} onClose={closeOverlay} />
          )}
        </div>
      )}
    </main>
  );
}
