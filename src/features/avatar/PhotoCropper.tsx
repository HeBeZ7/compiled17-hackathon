"use client";

import { useEffect, useRef, useState, type ChangeEvent, type DragEvent, type KeyboardEvent, type PointerEvent } from "react";
import { AVATAR_MIME_TYPES } from "@/shared/contracts";
import { Button } from "@/shared/ui";
import type { EditorState } from "./avatarDraft";
import { MAX_ZOOM, MIN_ZOOM, clampCrop, initialCrop, panCrop, type PhotoCrop } from "./geometry";
import { SNIFF_BYTES, describePhotoProblem, describePhotoSizeProblem } from "./photoFile";
import { fetchImage, paintCropView, renderPhoto } from "./renderAvatar";
import styles from "./Avatar.module.css";

const VIEW_SIZE = 384;
const KEY_STEP = 12;

interface LoadedPhoto {
  /** Bytes exactly as provided: this is what gets stored as the original. */
  original: Blob;
  bitmap: ImageBitmap;
}

export function PhotoCropper({
  seedUrl,
  onChange,
}: {
  /** Saved original to re-crop. */
  seedUrl: string | null;
  onChange: (state: EditorState) => void;
}) {
  const viewRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const loadedBitmap = useRef<ImageBitmap | null>(null);
  const loadToken = useRef(0);
  const renderToken = useRef(0);
  const drag = useRef<{ pointerId: number; x: number; y: number; crop: PhotoCrop; moved: boolean } | null>(null);
  const [photo, setPhoto] = useState<LoadedPhoto | null>(null);
  const [crop, setCrop] = useState<PhotoCrop | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (viewRef.current && photo && crop) paintCropView(viewRef.current, photo.bitmap, crop);
  }, [photo, crop]);

  useEffect(() => {
    if (!seedUrl) return;
    const controller = new AbortController();
    const token = ++loadToken.current;
    void (async () => {
      try {
        const original = await fetchImage(seedUrl, controller.signal);
        const bitmap = await createImageBitmap(original);
        if (token !== loadToken.current) {
          bitmap.close();
          return;
        }
        install({ original, bitmap });
      } catch {
        if (token === loadToken.current) setProblem("Could not reload the saved photo for cropping  Your saved appearance is unchanged");
      }
    })();
    return () => {
      controller.abort();
      if (loadToken.current === token) loadToken.current = token + 1;
    };
  }, [seedUrl]);

  useEffect(
    () => () => {
      loadedBitmap.current?.close();
      loadedBitmap.current = null;
    },
    [],
  );

  function install(next: LoadedPhoto) {
    const previous = loadedBitmap.current;
    loadedBitmap.current = next.bitmap;
    setPhoto(next);
    setCrop(initialCrop(next.bitmap));
    setProblem(null);
    previous?.close();
  }

  const publish = (target: LoadedPhoto, nextCrop: PhotoCrop) => {
    const token = ++renderToken.current;
    onChange({ status: "pending" });
    renderPhoto(target.bitmap, nextCrop).then(
      (render) => {
        if (token !== renderToken.current) return;
        onChange({ status: "ready", draft: { inputKind: "photo", original: target.original, render } });
      },
      () => {
        if (token === renderToken.current) {
          onChange({ status: "failed", message: "Could not turn this photo into a game image  Please pick another photo" });
        }
      },
    );
  };

  const acceptFile = async (file: File) => {
    const token = ++loadToken.current;
    setBusy(true);
    setProblem(null);
    const reject = (message: string) => {
      setProblem(message);
      setBusy(false);
    };

    const header = new Uint8Array(await file.slice(0, SNIFF_BYTES).arrayBuffer());
    if (token !== loadToken.current) return;
    const fileProblem = describePhotoProblem(file, header);
    if (fileProblem) return reject(fileProblem);

    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(file);
    } catch {
      if (token === loadToken.current) reject("Could not read this photo  The file may be damaged");
      return;
    }
    if (token !== loadToken.current) {
      bitmap.close();
      return;
    }
    const sizeProblem = describePhotoSizeProblem(bitmap.width, bitmap.height);
    if (sizeProblem) {
      bitmap.close();
      return reject(sizeProblem);
    }

    const next = { original: file, bitmap };
    install(next);
    setBusy(false);
    publish(next, initialCrop(bitmap));
  };

  const handleFileInput = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Cleared so that picking the same file again still fires a change.
    event.target.value = "";
    if (file) void acceptFile(file);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file) void acceptFile(file);
  };

  const removePhoto = () => {
    loadToken.current++;
    renderToken.current++;
    loadedBitmap.current?.close();
    loadedBitmap.current = null;
    setPhoto(null);
    setCrop(null);
    setProblem(null);
    onChange({ status: "empty" });
  };

  const applyCrop = (next: PhotoCrop) => {
    setCrop(next);
    if (photo) publish(photo, next);
  };

  const handlePointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (drag.current || event.button !== 0 || !crop) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, crop, moved: false };
  };

  const handlePointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId || !photo) return;
    const dx = event.clientX - active.x;
    const dy = event.clientY - active.y;
    if (dx === 0 && dy === 0) return;
    active.x = event.clientX;
    active.y = event.clientY;
    active.moved = true;
    const viewWidth = event.currentTarget.getBoundingClientRect().width;
    active.crop = panCrop(photo.bitmap, active.crop, dx, dy, viewWidth);
    setCrop(active.crop);
  };

  const handlePointerEnd = (event: PointerEvent<HTMLCanvasElement>) => {
    const active = drag.current;
    if (active?.pointerId !== event.pointerId) return;
    drag.current = null;
    if (active.moved && photo) publish(photo, active.crop);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLCanvasElement>) => {
    if (!photo || !crop) return;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [KEY_STEP, 0],
      ArrowRight: [-KEY_STEP, 0],
      ArrowUp: [0, KEY_STEP],
      ArrowDown: [0, -KEY_STEP],
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    applyCrop(panCrop(photo.bitmap, crop, move[0], move[1], VIEW_SIZE));
  };

  return (
    <div className={styles.editor}>
      <div className={styles.dropZone} onDragOver={(event) => event.preventDefault()} onDrop={handleDrop}>
        {photo && crop ? (
          <canvas
            ref={viewRef}
            className={styles.cropView}
            width={VIEW_SIZE}
            height={VIEW_SIZE}
            tabIndex={0}
            data-testid="photo-crop-view"
            aria-label="Adjust photo position by dragging or with the arrow keys"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerEnd}
            onPointerCancel={handlePointerEnd}
            onLostPointerCapture={handlePointerEnd}
            onKeyDown={handleKeyDown}
          />
        ) : (
          <p className={styles.dropHint}>Drop a photo here or pick one with the button below</p>
        )}
      </div>

      <input
        ref={inputRef}
        className={styles.fileInput}
        type="file"
        accept={AVATAR_MIME_TYPES.join(",")}
        data-testid="avatar-photo-input"
        aria-label="Choose a photo file"
        onChange={handleFileInput}
      />

      {busy && <p role="status">Reading the photo</p>}
      {problem && (
        <p className={styles.problem} role="alert" data-testid="avatar-error">
          {problem}
        </p>
      )}

      {photo && crop && (
        <label className={styles.zoom}>
          Zoom
          <input
            type="range"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.05}
            value={crop.zoom}
            onChange={(event) => applyCrop(clampCrop(photo.bitmap, { ...crop, zoom: Number(event.target.value) }))}
          />
        </label>
      )}

      <div className={styles.toolRow}>
        <Button variant="secondary" onClick={() => inputRef.current?.click()}>
          {photo ? "Pick another photo" : "Pick a photo"}
        </Button>
        {photo && (
          <Button variant="ghost" onClick={removePhoto}>
            Remove photo
          </Button>
        )}
      </div>

      <p className={styles.note}>
        PNG, JPEG or WebP up to 8MB  Your photo appears in the classroom as a round sticker  Background removal, 3D conversion and multi-direction animation are
        not available
      </p>
    </div>
  );
}
