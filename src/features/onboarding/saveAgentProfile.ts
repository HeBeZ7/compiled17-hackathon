import type { AvatarDraft, AvatarSelection } from "@/features/avatar";
import { fail, type AgentProfile, type AvatarAsset, type ModelReference, type SaveAgentRequest, type ServiceResult } from "@/shared/contracts";

export interface ProfileClient {
  uploadAvatar: (form: FormData, signal?: AbortSignal) => Promise<ServiceResult<AvatarAsset>>;
  saveAgent: (input: SaveAgentRequest, signal?: AbortSignal) => Promise<ServiceResult<AgentProfile>>;
}

/** An upload already stored on the server, so a retried save does not store it twice. */
export interface StoredUpload {
  draft: AvatarDraft;
  asset: AvatarAsset;
}

export interface SaveProfileInput {
  name: string;
  model: ModelReference | null;
  selection: AvatarSelection;
  expectedVersion: number | null;
  storedUpload: StoredUpload | null;
}

export interface SaveProfileOutcome {
  result: ServiceResult<AgentProfile>;
  storedUpload: StoredUpload | null;
}

function toForm(draft: AvatarDraft): FormData {
  const form = new FormData();
  form.set("inputKind", draft.inputKind);
  form.set("original", draft.original, "original");
  form.set("render", draft.render, "render.png");
  return form;
}

/** Stores the appearance if it is new, then saves model and appearance in one profile. */
export async function saveAgentProfile(
  input: SaveProfileInput,
  client: ProfileClient,
  signal?: AbortSignal,
): Promise<SaveProfileOutcome> {
  const { selection, storedUpload } = input;
  let avatarAssetId: string;
  let upload = storedUpload;

  if (selection.status === "saved") {
    avatarAssetId = selection.avatar.assetId;
  } else if (selection.status === "draft") {
    if (!upload || upload.draft !== selection.draft) {
      const uploaded = await client.uploadAvatar(toForm(selection.draft), signal);
      if (!uploaded.ok) return { result: uploaded, storedUpload };
      upload = { draft: selection.draft, asset: uploaded.data };
    }
    avatarAssetId = upload.asset.assetId;
  } else {
    return { result: fail("INVALID_REQUEST", "캐릭터 외형을 먼저 완성해 주세요."), storedUpload };
  }

  const result = await client.saveAgent(
    {
      name: input.name,
      selectedModel: input.model,
      avatarAssetId,
      expectedVersion: input.expectedVersion,
    },
    signal,
  );
  return { result, storedUpload: upload };
}
