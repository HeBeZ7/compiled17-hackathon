import { describe, expect, it } from "vitest";
import { BenchmarkScore, PriceQuote, TrainingStatus, notConnected } from "./index";

const quote = {
  quoteId: "q1",
  provider: "p",
  region: null,
  gpuType: null,
  currency: null,
  unit: null,
  unitPrice: null,
  estimatedTotal: null,
  queriedAt: "2026-11-09T00:00:00.000Z",
  sourceUrl: null,
  freshness: "fetch_failed",
  cachedAt: null,
  excludedCosts: [],
  notes: null,
};

describe("contracts", () => {
  it("represents a failed price lookup as null, keeping it distinct from free", () => {
    expect(PriceQuote.parse(quote).unitPrice).toBeNull();
    expect(PriceQuote.parse({ ...quote, unitPrice: 0, freshness: "live" }).unitPrice).toBe(0);
  });

  it("rejects a missing price instead of defaulting it", () => {
    const { unitPrice: _omitted, ...withoutPrice } = quote;
    expect(PriceQuote.safeParse(withoutPrice).success).toBe(false);
  });

  it("keeps an unmeasured benchmark null", () => {
    const score = BenchmarkScore.parse({
      benchmark: "b",
      task: null,
      dataset: null,
      conditions: null,
      score: null,
      unit: null,
      sourceUrl: null,
      checkedAt: null,
    });
    expect(score.score).toBeNull();
  });

  it("carries the BUILD_PLAN section 8 training states", () => {
    for (const status of ["status_unknown", "cancel_requested", "verifying_artifact"]) {
      expect(TrainingStatus.safeParse(status).success).toBe(true);
    }
  });

  it("marks an unwired service as not connected and non-retryable", () => {
    const result = notConnected("GPU training");
    expect(result.error.code).toBe("NOT_CONNECTED");
    expect(result.error.retryable).toBe(false);
  });
});
