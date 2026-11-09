// page.route로 돌려주는 테스트 대역 응답. A의 zod 계약과의 일치는
// tests/integration/fixture-contract.test.ts가 검사한다.
const T = "2026-11-09T00:00:00.000Z";
const claim = { support: "unknown", evidence: null };

export const baseModel = {
  source: "fixture", publisher: null, modelId: "fixture/student-a", revision: null, licenseRef: null,
  capabilities: { listed: claim, accessible: claim, filesPreparable: claim, inference: claim, training: claim, accountVerified: claim },
};

export const ok = <T>(data: T) => ({ ok: true as const, data });

export const apiError = (code: string, message: string) => ({ code, message, retryable: true, requiredConfig: [] as string[] });
export const fail = (code: string, message: string) => ({ ok: false as const, error: apiError(code, message) });

export const quote = (over: Record<string, unknown> = {}) => ({
  quoteId: "fixture-quote", provider: "fixture-cloud", region: "fixture-region-1", gpuType: null, currency: "USD",
  unit: "gpu_hour", unitPrice: 2.5, estimatedTotal: null, queriedAt: T, sourceUrl: "https://fixture.invalid/prices",
  freshness: "live", cachedAt: null, excludedCosts: ["storage"], notes: null, ...over,
});

export const unknownQuote = () => quote({
  region: null, currency: null, unit: null, unitPrice: null, sourceUrl: null, freshness: "fetch_failed", excludedCosts: [],
});

export const run = (over: Record<string, unknown> = {}) => ({
  runId: "fixture-run", providerJobId: "fixture-job", status: "running", statusReason: null,
  requestKey: "11111111-1111-4111-8111-111111111111",
  spec: {
    agentId: "22222222-2222-4222-8222-222222222222", profileVersion: 1, baseModel, method: "lora",
    datasetId: "fixture-dataset", config: {}, provider: "fixture-cloud", costLimit: { currency: "USD", amount: 10 },
  },
  artifactId: null, trainingCompleted: false, runtimeReady: false, evaluationResult: null,
  lastObservedAt: T, pollError: null, createdAt: T, updatedAt: T, ...over,
});

export const runtime = (over: Record<string, unknown> = {}) => ({
  artifactId: "fixture-artifact", state: "not_loaded", responseVerifiedAt: null, error: null, updatedAt: T, ...over,
});
