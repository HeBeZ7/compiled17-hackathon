import "server-only";
import { z } from "zod";
import { fail, ok, type ApiError, type CapabilityClaim, type CatalogEntry, type ServiceResult } from "@/shared/contracts";
import { nebiusTrainingClaim } from "@/server/training/nebiusModels";

export const HF_SOURCE = "huggingface";
export const HF_TOKEN_NAME = "HF_TOKEN";
const HF_ORIGIN = "https://huggingface.co";
const TIMEOUT_MS = 15_000;

const MODEL_ID = /^[\w.-]+\/[\w.-]+$/;
const REVISION = /^[0-9a-f]{40}$/;
const WEIGHT_FILE = /(\.safetensors|pytorch_model.*\.bin)$/;
const LIST_FIELDS = ["sha", "gated", "lastModified", "cardData", "tags", "downloads", "likes", "private", "pipeline_tag", "library_name"];

const HfModel = z.object({
  id: z.string(),
  sha: z.string().nullish(),
  gated: z.union([z.boolean(), z.string()]).nullish(),
  private: z.boolean().nullish(),
  tags: z.array(z.string()).nullish(),
  cardData: z.object({ license: z.union([z.string(), z.array(z.string())]).nullish() }).nullish(),
  siblings: z.array(z.object({ rfilename: z.string() })).nullish(),
});
type HfModel = z.output<typeof HfModel>;

function authHeaders(): Record<string, string> {
  const token = process.env[HF_TOKEN_NAME];
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function httpFailure(status: number): { ok: false; error: ApiError } {
  if (status === 429) return fail("RATE_LIMITED", "Hugging Face request limit exceeded", { retryable: true });
  // The Hub answers 401 for a missing repo as well as for a forbidden one.
  if (status === 401 || status === 403 || status === 404) return fail("NOT_FOUND", "Model not found or access denied");
  return fail("PROVIDER_ERROR", `Hugging Face error (HTTP ${status})`, { retryable: status >= 500 });
}

async function hubFetch(url: string, method: "GET" | "HEAD", signal: AbortSignal): Promise<ServiceResult<Response>> {
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method,
      headers: authHeaders(),
      signal: AbortSignal.any([signal, timeout]),
      cache: "no-store",
    });
    return ok(response);
  } catch {
    return timeout.aborted
      ? fail("PROVIDER_TIMEOUT", "Hugging Face response timed out", { retryable: true })
      : fail("PROVIDER_ERROR", "Could not connect to Hugging Face", { retryable: true });
  }
}

function licenseOf(model: HfModel): string | null {
  const card = model.cardData?.license;
  if (typeof card === "string") return card;
  if (Array.isArray(card) && card.length > 0) return card.join(", ");
  return model.tags?.find((tag) => tag.startsWith("license:"))?.slice("license:".length) ?? null;
}

function unknownClaim(note: string): CapabilityClaim {
  return { support: "unknown", evidence: { level: "UNKNOWN", sourceUrl: null, checkedAt: null, note } };
}

function toEntry(model: HfModel, checkedAt: string): CatalogEntry {
  const sourceUrl = `${HF_ORIGIN}/${model.id}`;
  const observed = (note: string): CapabilityClaim => ({
    support: "yes",
    evidence: { level: "RUNTIME_VERIFIED", sourceUrl, checkedAt, note },
  });

  const isOpen = model.gated === false && model.private !== true;
  const hasWeights = model.siblings?.some((file) => WEIGHT_FILE.test(file.rfilename)) ?? false;

  return {
    ref: {
      source: HF_SOURCE,
      publisher: model.id.split("/")[0],
      modelId: model.id,
      revision: model.sha ?? null,
      licenseRef: licenseOf(model),
      capabilities: {
        listed: observed("Present in the Hugging Face Hub response"),
        accessible: isOpen
          ? observed("Public model according to Hub metadata")
          : unknownClaim(`Access restriction: ${model.gated === undefined || model.gated === null ? "unknown" : String(model.gated)} · account approval unknown`),
        filesPreparable:
          isOpen && hasWeights
            ? observed("Weight file list confirmed · not actually downloaded")
            : unknownClaim("Weight file access could not be confirmed"),
        inference: unknownClaim("This catalog does not check inference availability"),
        training: nebiusTrainingClaim(model.id),
        accountVerified: unknownClaim("Not verified on the current account"),
      },
    },
    displayName: model.id.split("/")[1] ?? model.id,
    tags: model.tags ?? [],
    // No sourced benchmark is wired. An empty list is never a score of zero.
    benchmarks: [],
  };
}

/** Takes only the opaque cursor from the Link header, so no provider URL is followed. */
function nextCursorFrom(link: string | null): string | null {
  const next = link?.split(",").find((part) => /rel="next"/.test(part));
  const url = next?.match(/<([^>]+)>/)?.[1];
  return url ? new URL(url).searchParams.get("cursor") : null;
}

export interface HubSearch {
  query: string;
  cursor?: string;
  limit: number;
  signal: AbortSignal;
}

export async function searchHub(input: HubSearch): Promise<ServiceResult<{ items: CatalogEntry[]; nextCursor: string | null; fetchedAt: string }>> {
  const params = new URLSearchParams({ filter: "text-generation", sort: "downloads", direction: "-1", limit: String(input.limit) });
  if (input.query) params.set("search", input.query);
  if (input.cursor) params.set("cursor", input.cursor);
  for (const field of LIST_FIELDS) params.append("expand[]", field);

  const result = await hubFetch(`${HF_ORIGIN}/api/models?${params}`, "GET", input.signal);
  if (!result.ok) return result;
  if (!result.data.ok) return httpFailure(result.data.status);

  const parsed = z.array(HfModel).safeParse(await result.data.json().catch(() => null));
  if (!parsed.success) return fail("PROVIDER_ERROR", "Could not parse the Hugging Face response", { retryable: true });

  const fetchedAt = new Date().toISOString();
  return ok({
    items: parsed.data.map((model) => toEntry(model, fetchedAt)),
    nextCursor: nextCursorFrom(result.data.headers.get("link")),
    fetchedAt,
  });
}

export async function lookupHubModel(modelId: string, revision: string | undefined, signal: AbortSignal): Promise<ServiceResult<CatalogEntry>> {
  if (!MODEL_ID.test(modelId)) return fail("INVALID_REQUEST", "Invalid model ID format");
  if (revision !== undefined && !REVISION.test(revision)) return fail("INVALID_REQUEST", "Revision must be a 40-character commit hash");

  const path = `${HF_ORIGIN}/api/models/${modelId}${revision ? `/revision/${revision}` : ""}`;
  const result = await hubFetch(path, "GET", signal);
  if (!result.ok) return result;
  if (!result.data.ok) return httpFailure(result.data.status);

  const parsed = HfModel.safeParse(await result.data.json().catch(() => null));
  if (!parsed.success) return fail("PROVIDER_ERROR", "Could not parse the Hugging Face response", { retryable: true });
  return ok(toEntry(parsed.data, new Date().toISOString()));
}

/** Touches a small real file at a pinned revision, which proves this server's access. */
export async function checkHubFileAccess(modelId: string, revision: string, signal: AbortSignal): Promise<ServiceResult<boolean>> {
  if (!MODEL_ID.test(modelId) || !REVISION.test(revision)) return fail("INVALID_REQUEST", "Invalid model identifier format");
  const result = await hubFetch(`${HF_ORIGIN}/${modelId}/resolve/${revision}/config.json`, "HEAD", signal);
  if (!result.ok) return result;
  if (result.data.ok) return ok(true);
  if (result.data.status === 401 || result.data.status === 403 || result.data.status === 404) return ok(false);
  return httpFailure(result.data.status);
}

export function hubTreeUrl(modelId: string, revision: string): string {
  return `${HF_ORIGIN}/${modelId}/tree/${revision}`;
}
