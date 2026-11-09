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
      return "아직 외형이 없어요";
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
        교실에서 보일 모습
        {selection.status === "saved" && <StatusBadge tone="ok">저장된 외형</StatusBadge>}
        {selection.status === "draft" && <StatusBadge tone="warn">아직 저장 전</StatusBadge>}
      </figcaption>
      <div className={styles.stage}>
        <span className={styles.groundShadow} aria-hidden="true" />
        <canvas
          ref={canvasRef}
          className={styles.sprite}
          width={AVATAR_RENDER_SIZE}
          height={AVATAR_RENDER_SIZE}
          role="img"
          aria-label={`${name.trim() || "이름 없는 캐릭터"}의 외형 미리보기`}
          hidden={source === null && !pending}
        />
        {source === null && !pending && <p className={styles.previewEmpty}>{statusText(selection)}</p>}
      </div>
      <p className={styles.nameTag}>{name.trim() || "이름을 지어 주세요"}</p>
      {failed && <p className={styles.problem}>저장된 외형 이미지를 불러오지 못했습니다.</p>}
    </figure>
  );
}
