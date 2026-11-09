"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { Vec2 } from "./movement";
import styles from "./Classroom.module.css";

type DirectionPadProps = {
  disabled: boolean;
  onChange: (vector: Vec2) => void;
};

const RADIUS = 46;

/** On-screen joystick. Every way a pointer can end returns the stick to centre. */
export function DirectionPad({ disabled, onChange }: DirectionPadProps) {
  const baseRef = useRef<HTMLDivElement>(null);
  const activePointer = useRef<number | null>(null);
  const [knob, setKnob] = useState<Vec2>({ x: 0, y: 0 });

  const release = useCallback(() => {
    activePointer.current = null;
    setKnob({ x: 0, y: 0 });
    onChange({ x: 0, y: 0 });
  }, [onChange]);

  useEffect(() => release, [release]);

  const track = (event: ReactPointerEvent<HTMLDivElement>) => {
    const base = baseRef.current;
    if (!base) return;
    const rect = base.getBoundingClientRect();
    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = event.clientY - (rect.top + rect.height / 2);
    const length = Math.hypot(dx, dy);
    const clamp = length > RADIUS ? RADIUS / length : 1;
    setKnob({ x: dx * clamp, y: dy * clamp });
    onChange({ x: (dx * clamp) / RADIUS, y: (dy * clamp) / RADIUS });
  };

  return (
    <div
      ref={baseRef}
      className={styles.pad}
      data-disabled={disabled}
      data-testid="direction-pad"
      role="application"
      aria-label="캐릭터 이동 조작부"
      onPointerDown={(event) => {
        if (disabled || activePointer.current !== null) return;
        activePointer.current = event.pointerId;
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          // The pointer already ended; the release handlers still reset the stick.
        }
        track(event);
      }}
      onPointerMove={(event) => {
        if (event.pointerId === activePointer.current) track(event);
      }}
      onPointerUp={(event) => {
        if (event.pointerId === activePointer.current) release();
      }}
      onPointerCancel={(event) => {
        if (event.pointerId === activePointer.current) release();
      }}
      onLostPointerCapture={(event) => {
        if (event.pointerId === activePointer.current) release();
      }}
    >
      <span className={styles.padRight} data-testid="dpad-right" />
      <span className={styles.knob} style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
    </div>
  );
}
