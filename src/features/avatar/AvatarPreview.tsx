"use client";

import { useEffect, useRef, useState } from "react";
import { StatusBadge } from "@/shared/ui";
import type { AvatarSelection } from "./avatarDraft";
import { AVATAR_RENDER_SIZE, loadBitmap } from "./renderAvatar";
import styles from "./Avatar.module.css";

function previewSource(selection: AvatarSelection): Blob | string | null {
  if (selection.status === "saved") return selection.avatar.renderUrl;
  if (selection.status === "draft") return selection.draft.render;
  return null;
}

function statusText(selection: AvatarSelection): string {
  switch (selection.status) {
    case "none":
      return "No appearance yet";
    case "failed":
      return selection.message;
    default:
      return "";
  }
}

/** Shows the exact image the classroom will use, standing on a patch of classroom floor. */
export function AvatarPreview({ selection, name }: { selection: AvatarSelection; name: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failedSource, setFailedSource] = useState<Blob | string | null>(null);
  const source = previewSource(selection);
  // The previous image stays up while a new one is produced, so it does not blink on every stroke.
  const pending = selection.status === "pending";

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || pending) return;
    if (!source) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    const controller = new AbortController();
    loadBitmap(source, controller.signal).then(
      (bitmap) => {
        if (!controller.signal.aborted) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        }
        bitmap.close();
      },
      () => {
        if (!controller.signal.aborted) setFailedSource(source);
      },
    );
    return () => controller.abort();
  }, [source, pending]);

  const failed = source !== null && failedSource === source;

  return (
    <figure className={styles.preview} data-testid="avatar-preview" data-selection={selection.status}>
      <figcaption className={styles.previewTitle}>
        How you will look in the classroom
        {selection.status === "saved" && <StatusBadge tone="ok">Saved appearance</StatusBadge>}
        {selection.status === "draft" && <StatusBadge tone="warn">Not saved yet</StatusBadge>}
      </figcaption>
      <div className={styles.stage}>
        <span className={styles.groundShadow} aria-hidden="true" />
        <canvas
          ref={canvasRef}
          className={styles.sprite}
          width={AVATAR_RENDER_SIZE}
          height={AVATAR_RENDER_SIZE}
          role="img"
          aria-label={`Appearance preview for ${name.trim() || "an unnamed character"}`}
          hidden={source === null && !pending}
        />
        {source === null && !pending && <p className={styles.previewEmpty}>{statusText(selection)}</p>}
      </div>
      <p className={styles.nameTag}>{name.trim() || "Give your character a name"}</p>
      {failed && <p className={styles.problem}>Could not load the saved appearance image</p>}
    </figure>
  );
}
