"use client";

import { useCallback } from "react";
import type { AvatarInputKind } from "@/shared/contracts";
import type { EditorState } from "./avatarDraft";
import { DrawingPad } from "./DrawingPad";
import { PhotoCropper } from "./PhotoCropper";
import type { AvatarDraftController } from "./useAvatarDraft";
import styles from "./Avatar.module.css";

const INPUT_KINDS: { kind: AvatarInputKind; label: string }[] = [
  { kind: "drawing", label: "직접 그리기" },
  { kind: "photo", label: "사진 넣기" },
];

/** Both editors stay mounted so that switching input never loses the other one's work. */
export function AvatarEditor({ controller }: { controller: AvatarDraftController }) {
  const { saved, kind, setKind, report } = controller;
  const reportDrawing = useCallback((state: EditorState) => report("drawing", state), [report]);
  const reportPhoto = useCallback((state: EditorState) => report("photo", state), [report]);

  return (
    <div className={styles.avatarEditor}>
      <fieldset className={styles.kindPicker}>
        <legend>외형 만들기</legend>
        {INPUT_KINDS.map((option) => (
          <label key={option.kind} className={styles.kindOption} data-testid={`avatar-mode-${option.kind}`}>
            <input
              type="radio"
              name="avatar-input-kind"
              checked={kind === option.kind}
              onChange={() => setKind(option.kind)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </fieldset>

      <div hidden={kind !== "drawing"}>
        <DrawingPad seedUrl={saved?.inputKind === "drawing" ? saved.originalUrl : null} onChange={reportDrawing} />
      </div>
      <div hidden={kind !== "photo"}>
        <PhotoCropper seedUrl={saved?.inputKind === "photo" ? saved.originalUrl : null} onChange={reportPhoto} />
      </div>
    </div>
  );
}
