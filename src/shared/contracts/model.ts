import { z } from "zod";
import { Evidence, Freshness, IsoTimestamp } from "./common";

export const SupportLevel = z.enum(["yes", "no", "unknown"]);
export type SupportLevel = z.infer<typeof SupportLevel>;

export const CapabilityClaim = z.object({
  support: SupportLevel,
  evidence: Evidence.nullable(),
});
export type CapabilityClaim = z.infer<typeof CapabilityClaim>;

/** PRODUCT_SPEC section 4 model states. Each stage is claimed separately. */
export const ModelCapabilities = z.object({
  listed: CapabilityClaim,
  accessible: CapabilityClaim,
  filesPreparable: CapabilityClaim,
  inference: CapabilityClaim,
  training: CapabilityClaim,
  accountVerified: CapabilityClaim,
});
export type ModelCapabilities = z.infer<typeof ModelCapabilities>;

export const ModelReference = z.object({
  /** Catalog slug, e.g. "huggingface". E defines the values it actually serves. */
  source: z.string().min(1),
  publisher: z.string().nullable(),
  modelId: z.string().min(1),
  /** null means unverified, not "latest". */
  revision: z.string().nullable(),
  licenseRef: z.string().nullable(),
  capabilities: ModelCapabilities,
});
export type ModelReference = z.infer<typeof ModelReference>;

export function isSameModel(
  a: Pick<ModelReference, "source" | "modelId" | "revision">,
  b: Pick<ModelReference, "source" | "modelId" | "revision">,
): boolean {
  return a.source === b.source && a.modelId === b.modelId && a.revision === b.revision;
}

/** A score without task, dataset and source cannot be shown as a comparison. */
export const BenchmarkScore = z.object({
  benchmark: z.string(),
  task: z.string().nullable(),
  dataset: z.string().nullable(),
  conditions: z.string().nullable(),
  /** null = not measured. Distinct from 0. */
  score: z.number().nullable(),
  unit: z.string().nullable(),
  sourceUrl: z.url().nullable(),
  checkedAt: IsoTimestamp.nullable(),
});
export type BenchmarkScore = z.infer<typeof BenchmarkScore>;

export const CatalogEntry = z.object({
  ref: ModelReference,
  displayName: z.string(),
  tags: z.array(z.string()),
  benchmarks: z.array(BenchmarkScore),
});
export type CatalogEntry = z.infer<typeof CatalogEntry>;

export const CatalogSearchQuery = z.object({
  query: z.string().max(200).default(""),
  source: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type CatalogSearchQuery = z.infer<typeof CatalogSearchQuery>;

export const CatalogPage = z.object({
  items: z.array(CatalogEntry),
  nextCursor: z.string().nullable(),
  source: z.string(),
  freshness: Freshness,
  fetchedAt: IsoTimestamp,
});
export type CatalogPage = z.infer<typeof CatalogPage>;

export const ModelLookupQuery = z.object({
  source: z.string().min(1),
  modelId: z.string().min(1),
  revision: z.string().optional(),
});
export type ModelLookupQuery = z.infer<typeof ModelLookupQuery>;

export const ModelPreparationRequest = z.object({ ref: ModelReference });
export type ModelPreparationRequest = z.infer<typeof ModelPreparationRequest>;

export const ModelPreparationStatus = z.enum(["preparing", "ready", "failed", "unknown"]);
export type ModelPreparationStatus = z.infer<typeof ModelPreparationStatus>;

export const ModelPreparation = z.object({
  preparationId: z.string(),
  ref: ModelReference,
  status: ModelPreparationStatus,
  /** Real storage location (R-015). null until known. */
  location: z
    .object({
      kind: z.enum(["provider_storage", "local_disk", "remote_hub"]),
      uri: z.string().nullable(),
    })
    .nullable(),
  statusReason: z.string().nullable(),
  updatedAt: IsoTimestamp,
});
export type ModelPreparation = z.infer<typeof ModelPreparation>;
