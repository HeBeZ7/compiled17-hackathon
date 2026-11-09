import { describe, expect, it } from "vitest";
import {
  TrainingSpec,
  TrainingStatus,
  type AgentProfile,
  type ModelArtifact,
  type ModelReference,
  type PriceQuote,
  type RuntimeStatus,
  type TrainingDataset,
  type TrainingRun,
  type TrainingValidation,
} from "@/shared/contracts";
import {
  TRAINING_STATUS_COPY,
  buildTrainingSpec,
  canCancel,
  classifyCreateFailure,
  describeArtifact,
  describeRuntime,
  describeTrainingOutcome,
  formatAmount,
  isPriceKnown,
  limitBelowEstimate,
  mergeRun,
  nextPollDelay,
  shouldPoll,
  submitBlockers,
  type SubmitInput,
} from "./learningLogic";

const AT = "2026-11-09T00:00:00.000Z";
const ID = "11111111-1111-4111-8111-111111111111";
const unknown = { support: "unknown" as const, evidence: null };
const model: ModelReference = {
  source: "hf",
  publisher: null,
  modelId: "acme/m",
  revision: null,
  licenseRef: null,
  capabilities: { listed: unknown, accessible: unknown, filesPreparable: unknown, inference: unknown, training: unknown, accountVerified: unknown },
};
const agent: AgentProfile = { agentId: ID, name: "초코", selectedModel: model, avatar: null, version: 2, createdAt: AT, updatedAt: AT };
const dataset: TrainingDataset = {
  datasetId: "d1",
  fileName: "a.jsonl",
  sizeBytes: 10,
  format: null,
  exampleCount: null,
  validation: "valid",
  issues: [],
  createdAt: AT,
};
const quote: PriceQuote = {
  quoteId: "q1",
  provider: "prov",
  region: null,
  gpuType: null,
  currency: "USD",
  unit: "gpu_hour",
  unitPrice: 2,
  estimatedTotal: 10,
  queriedAt: AT,
  sourceUrl: null,
  freshness: "live",
  cachedAt: null,
  excludedCosts: [],
  notes: null,
};
const validation: TrainingValidation = { status: "ready", reasons: [], checkedAt: AT };

function submitInput(overrides: Partial<SubmitInput> = {}): SubmitInput {
  return {
    agent,
    dataset,
    method: "lora",
    quote,
    limitCurrency: "usd",
    limitAmount: "20",
    validation,
    costApproved: true,
    submitting: false,
    hasPendingRequest: false,
    activeRun: null,
    ...overrides,
  };
}

function run(overrides: Partial<TrainingRun> = {}): TrainingRun {
  return {
    runId: "r1",
    providerJobId: null,
    status: "running",
    statusReason: null,
    requestKey: ID,
    spec: buildTrainingSpec(submitInput()) as TrainingSpec,
    artifactId: null,
    trainingCompleted: false,
    runtimeReady: false,
    evaluationResult: null,
    lastObservedAt: AT,
    pollError: null,
    createdAt: AT,
    updatedAt: AT,
    ...overrides,
  };
}

describe("status copy", () => {
  it("has a label for every contract status", () => {
    for (const status of TrainingStatus.options) expect(TRAINING_STATUS_COPY[status].label).not.toBe("");
  });

  it("does not present a cancel request as a confirmed cancel", () => {
    expect(TRAINING_STATUS_COPY.cancel_requested.label).not.toBe(TRAINING_STATUS_COPY.canceled.label);
    expect(TRAINING_STATUS_COPY.cancel_requested.detail).toContain("확정된 것이 아니며");
  });

  it("does not present an unknown status as failed", () => {
    expect(TRAINING_STATUS_COPY.status_unknown.tone).not.toBe("danger");
    expect(TRAINING_STATUS_COPY.status_unknown.detail).toContain("자동으로 다시 요청하지 않습니다");
  });
});

describe("polling", () => {
  it("stops only for settled states", () => {
    expect(shouldPoll("running")).toBe(true);
    expect(shouldPoll("status_unknown")).toBe(true);
    expect(shouldPoll("cancel_requested")).toBe(true);
    expect(shouldPoll("verifying_artifact")).toBe(true);
    for (const status of ["completed", "failed", "canceled", "blocked", "draft"] as const) expect(shouldPoll(status)).toBe(false);
  });

  it("backs off on failures up to a cap", () => {
    expect(nextPollDelay(0)).toBe(5_000);
    expect(nextPollDelay(1)).toBe(10_000);
    expect(nextPollDelay(10)).toBe(60_000);
  });
});

describe("canCancel", () => {
  it("allows only states with something the provider can stop", () => {
    expect(canCancel({ status: "running", providerJobId: null })).toBe(true);
    expect(canCancel({ status: "queued", providerJobId: "j" })).toBe(true);
    expect(canCancel({ status: "status_unknown", providerJobId: null })).toBe(false);
    expect(canCancel({ status: "status_unknown", providerJobId: "j" })).toBe(true);
    expect(canCancel({ status: "cancel_requested", providerJobId: "j" })).toBe(false);
    expect(canCancel({ status: "completed", providerJobId: "j" })).toBe(false);
  });
});

describe("classifyCreateFailure", () => {
  it("treats any outcome that may have reached the provider as unknown", () => {
    for (const code of ["STATUS_UNKNOWN", "NETWORK_ERROR", "PROVIDER_TIMEOUT", "PROVIDER_ERROR", "INVALID_RESPONSE", "INTERNAL", "ABORTED"] as const) {
      expect(classifyCreateFailure(code)).toBe("unknown");
    }
  });

  it("treats a refusal before any provider call as rejected", () => {
    for (const code of ["NOT_CONNECTED", "BLOCKED", "INVALID_REQUEST", "UNSUPPORTED"] as const) {
      expect(classifyCreateFailure(code)).toBe("rejected");
    }
  });
});

describe("mergeRun", () => {
  it("ignores a response older than what is shown", () => {
    const newer = run({ status: "cancel_requested", updatedAt: "2026-11-09T00:05:00.000Z" });
    const older = run({ status: "running", updatedAt: "2026-11-09T00:01:00.000Z" });
    expect(mergeRun([newer], older)[0].status).toBe("cancel_requested");
    expect(mergeRun([older], newer)[0].status).toBe("cancel_requested");
  });
});

describe("price display", () => {
  it("shows unknown rather than zero, and keeps a real zero", () => {
    expect(formatAmount(null, "USD")).toBe("미확인");
    expect(formatAmount(0, "USD")).toBe("0 USD");
  });

  it("does not treat a failed or unpriced quote as known", () => {
    expect(isPriceKnown(quote)).toBe(true);
    expect(isPriceKnown({ ...quote, unitPrice: null })).toBe(false);
    expect(isPriceKnown({ ...quote, freshness: "fetch_failed" })).toBe(false);
    expect(isPriceKnown({ ...quote, unitPrice: 0 })).toBe(true);
  });

  it("warns only when the same currency's estimate exceeds the limit", () => {
    expect(limitBelowEstimate(quote, "USD", "5")).toBe(true);
    expect(limitBelowEstimate(quote, "USD", "50")).toBe(false);
    expect(limitBelowEstimate(quote, "KRW", "5")).toBe(false);
    expect(limitBelowEstimate({ ...quote, estimatedTotal: null }, "USD", "5")).toBe(false);
  });
});

describe("buildTrainingSpec", () => {
  it("produces a spec the shared contract accepts, using the provider from the quote", () => {
    const spec = buildTrainingSpec(submitInput());
    expect(TrainingSpec.safeParse(spec).success).toBe(true);
    expect(spec).toMatchObject({ provider: "prov", profileVersion: 2, costLimit: { currency: "USD", amount: 20 } });
  });

  it("returns null while anything is missing", () => {
    expect(buildTrainingSpec(submitInput({ dataset: null }))).toBeNull();
    expect(buildTrainingSpec(submitInput({ limitAmount: "0" }))).toBeNull();
    expect(buildTrainingSpec(submitInput({ limitCurrency: "dollars" }))).toBeNull();
    expect(buildTrainingSpec(submitInput({ agent: { ...agent, selectedModel: null } }))).toBeNull();
  });
});

describe("submitBlockers", () => {
  it("is empty only when every condition holds", () => {
    expect(submitBlockers(submitInput())).toEqual([]);
  });

  it.each<[string, Partial<SubmitInput>]>([
    ["no approval", { costApproved: false }],
    ["unknown price", { quote: { ...quote, unitPrice: null } }],
    ["failed price", { quote: { ...quote, freshness: "fetch_failed" } }],
    ["blocked by server", { validation: { ...validation, status: "blocked" } }],
    ["no server check", { validation: null }],
    ["invalid data", { dataset: { ...dataset, validation: "invalid" } }],
    ["unresolved earlier request", { hasPendingRequest: true }],
    ["run still active", { activeRun: run() }],
  ])("blocks on %s", (_name, overrides) => {
    expect(submitBlockers(submitInput(overrides)).length).toBeGreaterThan(0);
  });
});

describe("result facts stay separate", () => {
  const artifact: ModelArtifact = {
    artifactId: "a1",
    runId: "r1",
    baseModel: model,
    kind: "lora_adapter",
    providerArtifactId: null,
    uri: null,
    existenceVerified: false,
    verifiedAt: null,
  };
  const runtime: RuntimeStatus = { artifactId: "a1", state: "loaded", responseVerifiedAt: null, error: null, updatedAt: AT };

  it("does not call an unobserved artifact confirmed", () => {
    expect(describeArtifact(artifact, "a1").tone).toBe("warn");
    expect(describeArtifact({ ...artifact, existenceVerified: true, verifiedAt: AT }, "a1").tone).toBe("ok");
    expect(describeArtifact(null, null).label).toBe("결과물 없음");
  });

  it("does not call a loaded model usable until a real response was observed", () => {
    expect(describeRuntime(runtime).tone).toBe("warn");
    expect(describeRuntime({ ...runtime, responseVerifiedAt: AT }).tone).toBe("ok");
    expect(describeRuntime({ ...runtime, state: "load_failed" }).tone).toBe("danger");
  });

  it("keeps training success distinct from a failed runtime", () => {
    expect(describeTrainingOutcome({ status: "completed", trainingCompleted: true }).tone).toBe("ok");
    expect(describeRuntime({ ...runtime, state: "load_failed" }).tone).toBe("danger");
  });
});
