// page.route로 돌려주는 테스트 대역 응답. A의 zod 계약과의 일치는
// tests/integration/fixture-contract.test.ts가 검사한다.
const T = "2026-11-09T00:00:00.000Z";
const claim = { support: "unknown", evidence: null };

export const baseModel = {
  source: "fixture", publisher: null, modelId: "fixture/student-a", revision: null, licenseRef: null,
  capabilities: { listed: claim, accessible: claim, filesPreparable: claim, inference: claim, training: claim, accountVerified: claim },
};

export const ok = <D>(data: D) => ({ ok: true as const, data });

// 메시지는 일부러 중립적으로 둔다. 화면 판정이 대역 문구 때문에 통과하면 안 된다.
export const apiError = (code: string) => ({ code, message: "대역 오류", retryable: true, requiredConfig: [] as string[] });
export const fail = (code: string) => ({ ok: false as const, error: apiError(code) });

export const quote = (over: Record<string, unknown> = {}) => ({
  quoteId: "fixture-quote", provider: "fixture-cloud", region: "fixture-region-1", gpuType: null, currency: "USD",
  unit: "gpu_hour", unitPrice: 2.5, estimatedTotal: null, queriedAt: T, sourceUrl: "https://fixture.invalid/prices",
  freshness: "live", cachedAt: null, excludedCosts: ["storage"], notes: null, ...over,
});

export const unknownQuote = () => quote({
  region: null, currency: null, unit: null, unitPrice: null, sourceUrl: null, freshness: "fetch_failed", excludedCosts: [],
});

const AGENT = "22222222-2222-4222-8222-222222222222";

export const run = (over: Record<string, unknown> = {}, agentId: string = AGENT) => ({
  runId: "fixture-run", providerJobId: "fixture-job", status: "running", statusReason: null,
  requestKey: "11111111-1111-4111-8111-111111111111",
  spec: {
    agentId, profileVersion: 1, baseModel, method: "lora",
    datasetId: "fixture-dataset", config: {}, provider: "fixture-cloud", costLimit: { currency: "USD", amount: 10 },
  },
  artifactId: null, trainingCompleted: false, runtimeReady: false, evaluationResult: null,
  lastObservedAt: T, pollError: null, createdAt: T, updatedAt: T, ...over,
});

export const runtime = (over: Record<string, unknown> = {}) => ({
  artifactId: "fixture-artifact", state: "not_loaded", responseVerifiedAt: null, error: null, updatedAt: T, ...over,
});

export const artifact = (over: Record<string, unknown> = {}) => ({
  artifactId: "fixture-artifact", runId: "fixture-run", baseModel, kind: "lora_adapter", providerArtifactId: "fixture-provider-artifact",
  uri: null, existenceVerified: true, verifiedAt: T, ...over,
});

export const dataset = () => ({
  datasetId: "fixture-dataset", fileName: "data.jsonl", sizeBytes: 10, format: "jsonl", exampleCount: 1,
  validation: "valid", issues: [] as string[], createdAt: T,
});

export const validation = () => ({ status: "ready", reasons: [] as unknown[], checkedAt: T });
