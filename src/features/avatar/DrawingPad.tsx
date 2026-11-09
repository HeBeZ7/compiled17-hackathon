"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { Button } from "@/shared/ui";
import type { EditorState } from "./avatarDraft";
import { canvasToPng, loadBitmap, renderDrawing } from "./renderAvatar";
import styles from "./Avatar.module.css";

const CANVAS_SIZE = 512;

// These are the user's paints, not interface colors, so they do not come from the design tokens.
const PAINTS = [
  { value: "#2B2B33", name: "검정" },
  { value: "#FFFFFF", name: "흰색" },
  { value: "#E5484D", name: "빨강" },
  { value: "#F76B15", name: "주황" },
  { value: "#FFC53D", name: "노랑" },
  { value: "#30A46C", name: "초록" },
  { value: "#3E93DE", name: "파랑" },
  { value: "#8E4EC6", name: "보라" },
  { value: "#F4A6C0", name: "분홍" },
  { value: "#F6D3B3", name: "밝은 살구" },
  { value: "#B9825A", name: "연한 갈색" },
  { value: "#6B4226", name: "진한 갈색" },
];

const BRUSHES = [
  { value: 6, name: "가는 붓" },
  { value: 14, name: "보통 붓" },
  { value: 28, name: "굵은 붓" },
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
          onChange({ status: "failed", message: "그림을 이미지로 만들지 못했습니다. 다시 시도해 주세요." });
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
        aria-label="캐릭터를 그리는 캔버스. 키보드만 쓴다면 사진 넣기를 이용해 주세요."
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onLostPointerCapture={handlePointerEnd}
      />

      {seedFailed && <p className={styles.problem}>저장된 그림을 이어 그릴 수 있게 불러오지 못했습니다. 저장된 외형은 그대로입니다.</p>}

      <div className={styles.toolRow} role="group" aria-label="색">
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
          직접 고르기
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
        <div className={styles.toolGroup} role="group" aria-label="붓 굵기">
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
          지우개
        </Button>
        <Button variant="ghost" disabled={operationCount === 0} onClick={undo}>
          되돌리기
        </Button>
        <Button variant="ghost" onClick={clear}>
          모두 지우기
        </Button>
      </div>
    </div>
  );
}
