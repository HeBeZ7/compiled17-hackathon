import "server-only";
import { randomUUID } from "node:crypto";
import {
  AVATAR_MAX_ORIGINAL_BYTES,
  AVATAR_MAX_RENDER_BYTES,
  AvatarInputKind,
  fail,
  ok,
  type AgentProfile,
  type AvatarAsset,
  type AvatarVariant,
  type CurrentAgentResponse,
  type RequestContext,
  type SaveAgentRequest,
  type ServiceResult,
} from "@/shared/contracts";
import { COLLECTIONS, RevisionConflictError, getStore, type Blob } from "./store";

// The first build keeps one agent per browser.
const CURRENT_AGENT_ID = "current";

export async function getCurrentAgent(ctx: RequestContext): Promise<ServiceResult<CurrentAgentResponse>> {
  const doc = getStore().get<AgentProfile>(COLLECTIONS.agents, ctx.ownerId, CURRENT_AGENT_ID);
  return ok({ agent: doc?.value ?? null });
}

export async function saveCurrentAgent(
  input: SaveAgentRequest,
  ctx: RequestContext,
): Promise<ServiceResult<AgentProfile>> {
  const store = getStore();

  let avatar: AvatarAsset | null = null;
  if (input.avatarAssetId) {
    avatar = store.get<AvatarAsset>(COLLECTIONS.avatars, ctx.ownerId, input.avatarAssetId)?.value ?? null;
    if (!avatar) return fail("NOT_FOUND", "저장된 외형을 찾지 못했습니다. 다시 올려 주세요.");
  }

  const existing = store.get<AgentProfile>(COLLECTIONS.agents, ctx.ownerId, CURRENT_AGENT_ID);
  if ((existing?.value.version ?? null) !== input.expectedVersion) {
    return fail("CONFLICT", "다른 곳에서 에이전트가 먼저 변경되었습니다. 최신 내용을 불러온 뒤 다시 저장해 주세요.");
  }

  const now = new Date().toISOString();
  const profile: AgentProfile = {
    agentId: existing?.value.agentId ?? randomUUID(),
    name: input.name,
    selectedModel: input.selectedModel,
    avatar,
    version: (existing?.value.version ?? 0) + 1,
    createdAt: existing?.value.createdAt ?? now,
    updatedAt: now,
  };

  try {
    store.put(COLLECTIONS.agents, ctx.ownerId, CURRENT_AGENT_ID, profile, {
      expectedRevision: existing?.revision ?? null,
    });
  } catch (error) {
    if (error instanceof RevisionConflictError) {
      return fail("CONFLICT", "다른 곳에서 에이전트가 먼저 변경되었습니다. 최신 내용을 불러온 뒤 다시 저장해 주세요.");
    }
    throw error;
  }
  return ok(profile);
}

function sniffImageMime(bytes: Uint8Array): string | null {
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
  if (bytes[0] === 0x89 && ascii(1, 4) === "PNG") return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  return null;
}

async function readImage(value: FormDataEntryValue | null, label: string, maxBytes: number) {
  if (!(value instanceof File) || value.size === 0) {
    return fail("INVALID_REQUEST", `${label} 파일이 필요합니다.`);
  }
  if (value.size > maxBytes) {
    return fail("PAYLOAD_TOO_LARGE", `${label} 파일은 ${Math.floor(maxBytes / 1024 / 1024)}MB 이하만 올릴 수 있습니다.`);
  }
  const bytes = new Uint8Array(await value.arrayBuffer());
  const mimeType = sniffImageMime(bytes);
  if (!mimeType) return fail("INVALID_REQUEST", `${label} 파일은 PNG, JPEG, WebP 이미지만 사용할 수 있습니다.`);
  return ok<Blob>({ mimeType, bytes });
}

function blobId(assetId: string, variant: AvatarVariant): string {
  return `avatar:${assetId}:${variant}`;
}

export async function saveAvatarAsset(form: FormData, ctx: RequestContext): Promise<ServiceResult<AvatarAsset>> {
  const inputKind = AvatarInputKind.safeParse(form.get("inputKind"));
  if (!inputKind.success) return fail("INVALID_REQUEST", "외형 입력 방식이 올바르지 않습니다.");

  const original = await readImage(form.get("original"), "원본", AVATAR_MAX_ORIGINAL_BYTES);
  if (!original.ok) return original;
  const render = await readImage(form.get("render"), "게임용", AVATAR_MAX_RENDER_BYTES);
  if (!render.ok) return render;

  const assetId = randomUUID();
  const asset: AvatarAsset = {
    assetId,
    inputKind: inputKind.data,
    originalUrl: `/api/avatars/${assetId}/original`,
    renderUrl: `/api/avatars/${assetId}/render`,
    createdAt: new Date().toISOString(),
  };

  const store = getStore();
  store.putBlob(ctx.ownerId, blobId(assetId, "original"), original.data);
  store.putBlob(ctx.ownerId, blobId(assetId, "render"), render.data);
  store.put(COLLECTIONS.avatars, ctx.ownerId, assetId, asset);
  return ok(asset);
}

export function readAvatarBlob(assetId: string, variant: AvatarVariant, ctx: RequestContext): Blob | null {
  return getStore().getBlob(ctx.ownerId, blobId(assetId, variant));
}
