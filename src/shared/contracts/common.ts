import { z } from "zod";

export const IsoTimestamp = z.iso.datetime({ offset: true });

/** PRODUCT_SPEC §4. Every factual claim shown to a user carries one of these. */
export const EvidenceLevel = z.enum([
  "USER_CONFIRMED",
  "DESIGN_DRAFT",
  "ASSISTANT_PROPOSED",
  "DOC_REVIEWED",
  "RUNTIME_VERIFIED",
  "UNKNOWN",
  "DEFERRED",
]);
export type EvidenceLevel = z.infer<typeof EvidenceLevel>;

export const Evidence = z.object({
  level: EvidenceLevel,
  sourceUrl: z.url().nullable(),
  checkedAt: IsoTimestamp.nullable(),
  note: z.string().nullable(),
});
export type Evidence = z.infer<typeof Evidence>;

/** Where a value came from at read time. A failed fetch is a state, never a zero. */
export const Freshness = z.enum(["live", "cached", "published_doc", "fetch_failed"]);
export type Freshness = z.infer<typeof Freshness>;

/** `test_double` may only be returned in an explicit test mode. */
export const ConnectionState = z.enum(["connected", "not_connected", "test_double", "unknown"]);
export type ConnectionState = z.infer<typeof ConnectionState>;
