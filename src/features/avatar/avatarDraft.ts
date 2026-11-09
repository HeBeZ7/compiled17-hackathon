import type { AvatarAsset, AvatarInputKind } from "@/shared/contracts";

/** Appearance made in this session and not uploaded yet. */
export interface AvatarDraft {
  inputKind: AvatarInputKind;
  original: Blob;
  render: Blob;
}

/** What one editor (drawing or photo) currently holds. */
export type EditorState =
  // Untouched: the saved appearance of this kind, if any, still applies.
  | { status: "pristine" }
  // A render is being produced. Saving must wait, or it would upload the previous one.
  | { status: "pending" }
  // The user removed everything.
  | { status: "empty" }
  | { status: "ready"; draft: AvatarDraft }
  | { status: "failed"; message: string };

export type EditorStates = Record<AvatarInputKind, EditorState>;

/** The appearance the agent would get if saved right now. */
export type AvatarSelection =
  | { status: "none" }
  | { status: "pending" }
  | { status: "saved"; avatar: AvatarAsset }
  | { status: "draft"; draft: AvatarDraft }
  | { status: "failed"; message: string };

export function selectAvatar(
  kind: AvatarInputKind,
  states: EditorStates,
  saved: AvatarAsset | null,
): AvatarSelection {
  const state = states[kind];
  switch (state.status) {
    case "pristine":
      return saved?.inputKind === kind ? { status: "saved", avatar: saved } : { status: "none" };
    case "empty":
      return { status: "none" };
    case "pending":
      return { status: "pending" };
    case "ready":
      return { status: "draft", draft: state.draft };
    case "failed":
      return { status: "failed", message: state.message };
  }
}
