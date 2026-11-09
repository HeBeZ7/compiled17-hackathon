"use client";

import { useCallback, useState } from "react";
import type { AvatarAsset, AvatarInputKind } from "@/shared/contracts";
import { selectAvatar, type EditorState, type EditorStates } from "./avatarDraft";

export function useAvatarDraft(saved: AvatarAsset | null) {
  const [kind, setKind] = useState<AvatarInputKind>(saved?.inputKind ?? "drawing");
  const [states, setStates] = useState<EditorStates>({
    drawing: { status: "pristine" },
    photo: { status: "pristine" },
  });

  const report = useCallback((editor: AvatarInputKind, state: EditorState) => {
    setStates((current) => ({ ...current, [editor]: state }));
  }, []);

  return { saved, kind, setKind, report, selection: selectAvatar(kind, states, saved) };
}

export type AvatarDraftController = ReturnType<typeof useAvatarDraft>;
