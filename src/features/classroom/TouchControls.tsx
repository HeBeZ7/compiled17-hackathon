"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { TOUCH_LOOK_SENSITIVITY, type FirstPersonController } from "./controller";
import styles from "./Classroom.module.css";

const STICK_RADIUS = 46;

/** Left-side move stick. Its vector is cleared with all other held input. */
export function MoveStick({ controller, disabled }: { controller: FirstPersonController; disabled: boolean }) {
  const activePointer = useRef<number | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });

  const reset = useCallback(() => {
    activePointer.current = null;
    setKnob({ x: 0, y: 0 });
  }, []);

  useEffect(() => controller.onClear(reset), [controller, reset]);

  const updateFrom = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = event.clientY - (rect.top + rect.height / 2);
    const distance = Math.hypot(dx, dy);
    const scale = distance > STICK_RADIUS ? STICK_RADIUS / distance : 1;
    const x = dx * scale;
    const y = dy * scale;
    setKnob({ x, y });
    controller.setStick(x / STICK_RADIUS, -y / STICK_RADIUS);
  };

  const end = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerId !== activePointer.current) return;
    controller.setStick(0, 0);
    reset();
  };

  return (
    <div
      className={styles.stick}
      role="group"
      aria-label="Move joystick"
      data-testid="classroom-joystick"
      onPointerDown={(event) => {
        if (disabled || activePointer.current !== null) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        activePointer.current = event.pointerId;
        updateFrom(event);
      }}
      onPointerMove={(event) => {
        if (event.pointerId === activePointer.current) updateFrom(event);
      }}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
    >
      <span className={styles.knob} style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
    </div>
  );
}

/** Right-side drag to look. Also the fallback for a mouse when pointer lock is refused. */
export function LookZone({ controller, disabled }: { controller: FirstPersonController; disabled: boolean }) {
  const drag = useRef<{ id: number; x: number; y: number } | null>(null);

  useEffect(
    () =>
      controller.onClear(() => {
        drag.current = null;
      }),
    [controller],
  );

  const end = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.id === event.pointerId) drag.current = null;
  };

  return (
    <div
      className={styles.lookZone}
      role="group"
      aria-label="Drag to look around"
      data-testid="classroom-look-zone"
      onPointerDown={(event) => {
        if (disabled || drag.current) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
      }}
      onPointerMove={(event) => {
        if (drag.current?.id !== event.pointerId) return;
        controller.addLook(event.clientX - drag.current.x, event.clientY - drag.current.y, TOUCH_LOOK_SENSITIVITY);
        drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
      }}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
    />
  );
}
