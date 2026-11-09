import { z } from "zod";
import { Freshness, IsoTimestamp } from "./common";
import { ModelReference } from "./model";
import { TrainingMethod } from "./training";

export const PriceQuoteRequest = z.object({
  baseModel: ModelReference,
  method: TrainingMethod.nullable(),
  provider: z.string().nullable(),
  region: z.string().nullable(),
  gpuType: z.string().nullable(),
  estimatedHours: z.number().positive().nullable(),
});
export type PriceQuoteRequest = z.infer<typeof PriceQuoteRequest>;

/** Unknown is null everywhere. A failed lookup must never read as free. */
export const PriceQuote = z.object({
  quoteId: z.string(),
  provider: z.string(),
  region: z.string().nullable(),
  gpuType: z.string().nullable(),
  currency: z.string().nullable(),
  /** Billing unit as the provider states it, e.g. "gpu_hour". */
  unit: z.string().nullable(),
  unitPrice: z.number().nonnegative().nullable(),
  /** An estimate. Not an invoice or a guaranteed total. */
  estimatedTotal: z.number().nonnegative().nullable(),
  queriedAt: IsoTimestamp,
  sourceUrl: z.url().nullable(),
  freshness: Freshness,
  cachedAt: IsoTimestamp.nullable(),
  excludedCosts: z.array(z.string()),
  notes: z.string().nullable(),
});
export type PriceQuote = z.infer<typeof PriceQuote>;
