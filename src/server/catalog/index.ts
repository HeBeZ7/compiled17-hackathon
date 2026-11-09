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
  return fail("UNSUPPORTED", `Unsupported catalog: ${source}`);
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
  if (!ref.revision) return fail("PROVIDER_ERROR", "Hugging Face did not return a model revision", { retryable: true });

  const access = await checkHubFileAccess(ref.modelId, ref.revision, ctx.signal);
  if (!access.ok) return access;

  const preparation: ModelPreparation = {
    preparationId: randomUUID(),
    ref,
    status: access.data ? "ready" : "failed",
    location: access.data ? { kind: "remote_hub", uri: hubTreeUrl(ref.modelId, ref.revision) } : null,
    statusReason: access.data
      ? "File access confirmed at the pinned Hugging Face revision · weights were not downloaded"
      : `Model files are not accessible · an approved ${HF_TOKEN_NAME} may be needed`,
    updatedAt: new Date().toISOString(),
  };
  getStore().put(COLLECTIONS.preparations, ctx.ownerId, preparation.preparationId, preparation);
  return ok(preparation);
}

export async function getModelPreparation(preparationId: string, ctx: RequestContext): Promise<ServiceResult<ModelPreparation>> {
  const doc = getStore().get<ModelPreparation>(COLLECTIONS.preparations, ctx.ownerId, preparationId);
  return doc ? ok(doc.value) : fail("NOT_FOUND", "Model preparation record not found");
}
