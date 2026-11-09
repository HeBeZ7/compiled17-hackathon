"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { Button } from "@/shared/ui";
import type { EditorState } from "./avatarDraft";
import { canvasToPng, loadBitmap, renderDrawing } from "./renderAvatar";
import styles from "./Avatar.module.css";

const CANVAS_SIZE = 512;

// These are the user's paints, not interface colors, so they do not come from the design tokens.
const PAINTS = [
  { value: "#2B2B33", name: "Black" },
  { value: "#FFFFFF", name: "White" },
  { value: "#E5484D", name: "Red" },
  { value: "#F76B15", name: "Orange" },
  { value: "#FFC53D", name: "Yellow" },
  { value: "#30A46C", name: "Green" },
  { value: "#3E93DE", name: "Blue" },
  { value: "#8E4EC6", name: "Purple" },
  { value: "#F4A6C0", name: "Pink" },
  { value: "#F6D3B3", name: "Peach" },
  { value: "#B9825A", name: "Tan" },
  { value: "#6B4226", name: "Brown" },
];

const BRUSHES = [
  { value: 6, name: "Thin brush" },
  { value: 14, name: "Medium brush" },
  { value: 28, name: "Thick brush" },
];

interface Point {
  x: number;
  y: number;
}

interface Stroke {
  kind: "stroke";
  color: string;
  size: number;
  erase: boolean;
  points: Point[];
}

// A clear is an operation too, so that it can be undone like a stroke.
type Operation = Stroke | { kind: "clear" };

function paintStroke(ctx: CanvasRenderingContext2D, stroke: Stroke, fromIndex = 0): void {
  ctx.save();
  ctx.globalCompositeOperation = stroke.erase ? "destination-out" : "source-over";
  ctx.strokeStyle = stroke.color;
  ctx.fillStyle = stroke.color;
  ctx.lineWidth = stroke.size;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const { points } = stroke;
  if (points.length === 1) {
    ctx.beginPath();
    ctx.arc(points[0].x, points[0].y, stroke.size / 2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(points[fromIndex].x, points[fromIndex].y);
    for (let i = fromIndex + 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.stroke();
  }
  ctx.restore();
}

export function DrawingPad({
  seedUrl,
  onChange,
}: {
  /** Saved drawing to continue from. */
  seedUrl: string | null;
  onChange: (state: EditorState) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const operations = useRef<Operation[]>([]);
  const base = useRef<ImageBitmap | null>(null);
  const activeStroke = useRef<{ pointerId: number; stroke: Stroke } | null>(null);
  const renderToken = useRef(0);
  const [paint, setPaint] = useState(PAINTS[0].value);
  const [brush, setBrush] = useState(BRUSHES[1].value);
  const [erasing, setErasing] = useState(false);
  const [operationCount, setOperationCount] = useState(0);
  const [seedFailed, setSeedFailed] = useState(false);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d", { willReadFrequently: true });
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const ops = operations.current;
    const lastClear = ops.findLastIndex((op) => op.kind === "clear");
    if (lastClear < 0 && base.current) ctx.drawImage(base.current, 0, 0, canvas.width, canvas.height);
    for (const op of ops.slice(lastClear + 1)) {
      if (op.kind === "stroke") paintStroke(ctx, op);
    }
  }, []);

  useEffect(() => {
    if (!seedUrl) return;
    const controller = new AbortController();
    loadBitmap(seedUrl, controller.signal).then(
      (bitmap) => {
        if (controller.signal.aborted) {
          bitmap.close();
          return;
        }
        base.current = bitmap;
        redraw();
      },
      () => {
        if (!controller.signal.aborted) setSeedFailed(true);
      },
    );
    return () => {
      controller.abort();
      base.current?.close();
      base.current = null;
    };
  }, [seedUrl, redraw]);

  const publish = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const token = ++renderToken.current;
    setOperationCount(operations.current.length);
    if (operations.current.length === 0) {
      onChange({ status: "pristine" });
      return;
    }
    onChange({ status: "pending" });
    Promise.all([renderDrawing(canvas), canvasToPng(canvas)]).then(
      ([render, original]) => {
        if (token !== renderToken.current) return;
        onChange(render ? { status: "ready", draft: { inputKind: "drawing", original, render } } : { status: "empty" });
      },
      () => {
        if (token === renderToken.current) {
          onChange({ status: "failed", message: "Could not turn your drawing into an image  Please try again" });
        }
      },
    );
  };

  const canvasPoint = (canvas: HTMLCanvasElement, event: { clientX: number; clientY: number }): Point => {
    const box = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - box.left) * canvas.width) / box.width,
      y: ((event.clientY - box.top) * canvas.height) / box.height,
    };
  };

  const handlePointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (activeStroke.current || event.button !== 0) return;
    const canvas = event.currentTarget;
    canvas.setPointerCapture(event.pointerId);
    const stroke: Stroke = {
      kind: "stroke",
      color: paint,
      size: brush,
      erase: erasing,
      points: [canvasPoint(canvas, event)],
    };
    activeStroke.current = { pointerId: event.pointerId, stroke };
    operations.current.push(stroke);
    renderToken.current++;
    onChange({ status: "pending" });
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (ctx) paintStroke(ctx, stroke);
  };

  const handlePointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const active = activeStroke.current;
    if (!active || active.pointerId !== event.pointerId) return;
    const canvas = event.currentTarget;
    const { stroke } = active;
    const from = stroke.points.length - 1;
    const samples = event.nativeEvent.getCoalescedEvents?.() ?? [];
    for (const sample of samples.length > 0 ? samples : [event.nativeEvent]) {
      stroke.points.push(canvasPoint(canvas, sample));
    }
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (ctx) paintStroke(ctx, stroke, from);
  };

  // Also runs on pointercancel and lost capture: what was drawn so far is kept.
  const handlePointerEnd = (event: PointerEvent<HTMLCanvasElement>) => {
    if (activeStroke.current?.pointerId !== event.pointerId) return;
    activeStroke.current = null;
    publish();
  };

  const undo = () => {
    operations.current.pop();
    redraw();
    publish();
  };

  const clear = () => {
    operations.current.push({ kind: "clear" });
    redraw();
    publish();
  };

  return (
    <div className={styles.editor}>
      <canvas
        ref={canvasRef}
        className={styles.drawingCanvas}
        width={CANVAS_SIZE}
        height={CANVAS_SIZE}
        data-testid="avatar-draw-canvas"
        aria-label="Canvas for drawing your character  Keyboard users can add a photo instead"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onLostPointerCapture={handlePointerEnd}
      />

      {seedFailed && <p className={styles.problem}>Could not reload the saved drawing for editing  Your saved appearance is unchanged</p>}

      <div className={styles.toolRow} role="group" aria-label="Color">
        {PAINTS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={styles.swatch}
            style={{ backgroundColor: option.value }}
            aria-label={option.name}
            aria-pressed={!erasing && paint === option.value}
            onClick={() => {
              setPaint(option.value);
              setErasing(false);
            }}
          />
        ))}
        <label className={styles.customPaint}>
          Custom
          <input
            type="color"
            data-testid="avatar-pen-color"
            value={paint}
            onChange={(event) => {
              setPaint(event.target.value);
              setErasing(false);
            }}
          />
        </label>
      </div>

      <div className={styles.toolRow}>
        <div className={styles.toolGroup} role="group" aria-label="Brush size">
          {BRUSHES.map((option) => (
            <button
              key={option.value}
              type="button"
              className={styles.brush}
              aria-label={option.name}
              aria-pressed={brush === option.value}
              onClick={() => setBrush(option.value)}
            >
              <span style={{ width: option.value * 0.7, height: option.value * 0.7 }} />
            </button>
          ))}
        </div>
        <Button variant={erasing ? "primary" : "secondary"} aria-pressed={erasing} onClick={() => setErasing((value) => !value)}>
          Eraser
        </Button>
        <Button variant="ghost" disabled={operationCount === 0} onClick={undo}>
          Undo
        </Button>
        <Button variant="ghost" onClick={clear}>
          Clear all
        </Button>
      </div>
    </div>
  );
}
