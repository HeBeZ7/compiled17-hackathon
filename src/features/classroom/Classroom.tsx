"use client";

import Phaser from "phaser";
import { useEffect, useRef } from "react";
import type { ClassroomProps } from "@/shared/contracts";
import { Button, StatusBadge, color, phaserColor } from "@/shared/ui";
import styles from "./Classroom.module.css";

function drawPlaceholderRoom(this: Phaser.Scene) {
  const { width, height } = this.scale;
  this.add.rectangle(width / 2, height * 0.8, width, height * 0.4, phaserColor("sky100"));
  this.add
    .rectangle(width / 2, height * 0.28, width * 0.42, height * 0.28, phaserColor("board600"))
    .setStrokeStyle(10, phaserColor("surface"));
}

/** Placeholder owned by B: boots the engine and proves the shell wiring. No movement yet. */
export function Classroom({ movementLocked, onInteract }: ClassroomProps) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const parent = hostRef.current;
    if (!parent) return;
    let game: Phaser.Game | undefined;
    // Deferred so React StrictMode's immediate unmount never creates a game.
    const frame = requestAnimationFrame(() => {
      game = new Phaser.Game({
        type: Phaser.AUTO,
        parent,
        width: 960,
        height: 540,
        backgroundColor: color.background,
        banner: false,
        scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
        scene: { create: drawPlaceholderRoom },
      });
    });
    return () => {
      cancelAnimationFrame(frame);
      game?.destroy(true);
    };
  }, []);

  return (
    <section
      className={styles.root}
      aria-label="교실"
      data-testid="classroom-placeholder"
      data-movement-locked={movementLocked}
    >
      <div className={styles.stage} ref={hostRef} />
      <div className={styles.controls}>
        <StatusBadge tone="warn">임시 교실 · 이동 미구현</StatusBadge>
        <Button variant="secondary" onClick={() => onInteract("teacher")}>
          선생님에게 말 걸기
        </Button>
        <Button variant="secondary" onClick={() => onInteract("study_spot")}>
          학습 자리 열기
        </Button>
      </div>
    </section>
  );
}
