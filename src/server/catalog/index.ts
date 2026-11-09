import "server-only";
import { randomUUID } from "node:crypto";
import { COLLECTIONS, getStore } from "@/server/store";
import {
  fail,
  ok,
  type CatalogEntry,
  type CatalogPage,
  type CatalogSearchQuery,
  type ModelLookupQuery,
  type ModelPreparation,
  type ModelPreparationRequest,
  type RequestContext,
  type ServiceResult,
} from "@/shared/contracts";
import { HF_SOURCE, HF_TOKEN_NAME, checkHubFileAccess, hubTreeUrl, lookupHubModel, searchHub } from "./huggingface";

// E owns this module. Hugging Face is the one real catalog source wired so far.

function unsupportedSource(source: string) {
  return fail("UNSUPPORTED", `지원하지 않는 카탈로그입니다: ${source}`);
}

export async function searchCatalog(input: CatalogSearchQuery, ctx: RequestContext): Promise<ServiceResult<CatalogPage>> {
  if (input.source && input.source !== HF_SOURCE) return unsupportedSource(input.source);
  const result = await searchHub({ query: input.query, cursor: input.cursor, limit: input.limit, signal: ctx.signal });
  if (!result.ok) return result;
  return ok({ ...result.data, source: HF_SOURCE, freshness: "live" });
}

export async function lookupCatalogEntry(input: ModelLookupQuery, ctx: RequestContext): Promise<ServiceResult<CatalogEntry>> {
  if (input.source !== HF_SOURCE) return unsupportedSource(input.source);
  return lookupHubModel(input.modelId, input.revision, ctx.signal);
}

/**
 * Pins the model to a Hub revision and proves this server can read its files.
 * No weights are copied: the managed training path uses the provider's own copy.
 */
export async function createModelPreparation(input: ModelPreparationRequest, ctx: RequestContext): Promise<ServiceResult<ModelPreparation>> {
  if (input.ref.source !== HF_SOURCE) return unsupportedSource(input.ref.source);

  // Capabilities sent by the client are ignored and re-read from the Hub.
  const entry = await lookupHubModel(input.ref.modelId, input.ref.revision ?? undefined, ctx.signal);
  if (!entry.ok) return entry;
  const { ref } = entry.data;
  if (!ref.revision) return fail("PROVIDER_ERROR", "Hugging Face가 모델 revision을 반환하지 않았습니다.", { retryable: true });

  const access = await checkHubFileAccess(ref.modelId, ref.revision, ctx.signal);
  if (!access.ok) return access;

  const preparation: ModelPreparation = {
    preparationId: randomUUID(),
    ref,
    status: access.data ? "ready" : "failed",
    location: access.data ? { kind: "remote_hub", uri: hubTreeUrl(ref.modelId, ref.revision) } : null,
    statusReason: access.data
      ? "Hugging Face의 고정 revision에서 파일 접근을 확인했습니다. 가중치를 내려받지는 않았습니다."
      : `이 모델 파일에 접근할 수 없습니다. 접근 승인을 받은 ${HF_TOKEN_NAME}이(가) 필요할 수 있습니다.`,
    updatedAt: new Date().toISOString(),
  };
  getStore().put(COLLECTIONS.preparations, ctx.ownerId, preparation.preparationId, preparation);
  return ok(preparation);
}

export async function getModelPreparation(preparationId: string, ctx: RequestContext): Promise<ServiceResult<ModelPreparation>> {
  const doc = getStore().get<ModelPreparation>(COLLECTIONS.preparations, ctx.ownerId, preparationId);
  return doc ? ok(doc.value) : fail("NOT_FOUND", "모델 준비 기록을 찾을 수 없습니다.");
}
