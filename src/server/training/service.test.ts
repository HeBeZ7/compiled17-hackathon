import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPricingService, type PriceProvider } from "@/server/pricing/service";
import { COLLECTIONS, createStore, type Store } from "@/server/store/store";
import { fail, type ModelReference, type RequestContext, type TrainingRun, type TrainingSpec } from "@/shared/contracts";
import { inspectDataset } from "./dataset";
import type { ProviderJob, TrainingProvider } from "./provider";
import { createTrainingService } from "./service";

const OWNER = "owner-a";
const ctx: RequestContext = { ownerId: OWNER, signal: new AbortController().signal };
const JOB_KEY = "11111111-1111-4111-8111-111111111111";
const SUFFIX = "aa-11111111111141118111111111111111";
const unknownClaim = { support: "unknown" as const, evidence: null };
const baseModel: ModelReference = {
  source: "huggingface",
  publisher: "meta-llama",
  modelId: "meta-llama/Llama-3.1-8B-Instruct",
  revision: null,
  licenseRef: null,
  capabilities: {
    listed: unknownClaim,
    accessible: unknownClaim,
    filesPreparable: unknownClaim,
    inference: unknownClaim,
    training: unknownClaim,
    accountVerified: unknownClaim,
  },
};

const job = (overrides: Partial<ProviderJob> = {}): ProviderJob => ({
  id: "ftjob-real",
  status: "running",
  suffix: SUFFIX,
  errorMessage: null,
  resultFiles: [],
  trainedSteps: null,
  totalSteps: null,
  ...overrides,
});

const indeterminate = { ok: false as const, error: fail("PROVIDER_TIMEOUT", "timeout", { retryable: true }).error, outcome: "indeterminate" as const };
const rejected = { ok: false as const, error: fail("PROVIDER_ERROR", "rejected").error, outcome: "rejected" as const };

function fakeProvider(): TrainingProvider & { [K in "uploadFile" | "createJob" | "getJob" | "listJobs" | "cancelJob" | "listCheckpoints" | "getFile"]: ReturnType<typeof vi.fn> } {
  return {
    id: "nebius",
    requiredConfig: ["NEBIUS_API_KEY"],
    isConfigured: () => true,
    uploadFile: vi.fn().mockResolvedValue({ ok: true, data: { id: "file-real" } }),
    createJob: vi.fn().mockResolvedValue({ ok: true, data: job({ status: "queued" }) }),
    getJob: vi.fn().mockResolvedValue({ ok: true, data: job() }),
    listJobs: vi.fn().mockResolvedValue({ ok: true, data: { jobs: [], hasMore: false } }),
    cancelJob: vi.fn().mockResolvedValue({ ok: true, data: job({ status: "cancelled" }) }),
    listCheckpoints: vi.fn().mockResolvedValue({ ok: true, data: [] }),
    getFile: vi.fn().mockResolvedValue({ ok: true, data: { id: "out", filename: "ckpt/adapter_config.json", bytes: 10 } }),
  };
}

const priced: PriceProvider = {
  id: "nebius",
  trainingPrice: async () => ({ unitPrice: 1, currency: "USD", unit: "per_1m_training_tokens", sourceUrl: "https://example.com/p", note: "operator" }),
};

let dir: string;
let store: Store;
let provider: ReturnType<typeof fakeProvider>;
let service: ReturnType<typeof createTrainingService>;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "aa-e-"));
  store = createStore(path.join(dir, "t.sqlite"));
  provider = fakeProvider();
  service = createTrainingService({ store, provider, prices: priced, maxApprovedUsd: () => 10 });
});

afterEach(() => {
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

async function upload(lines = ['{"messages":[{"role":"user","content":"q"},{"role":"assistant","content":"a"}]}']) {
  const form = new FormData();
  form.set("file", new File([lines.join("\n")], "data.jsonl"));
  const result = await service.uploadDataset(form, ctx);
  if (!result.ok) throw new Error(result.error.message);
  return result.data;
}

function specFor(datasetId: string, overrides: Partial<TrainingSpec> = {}): TrainingSpec {
  return {
    agentId: "22222222-2222-4222-8222-222222222222",
    profileVersion: 1,
    baseModel,
    method: "lora",
    datasetId,
    config: { n_epochs: 1 },
    provider: "nebius",
    costLimit: { currency: "USD", amount: 5 },
    ...overrides,
  };
}

async function createRun(spec: TrainingSpec, requestKey = JOB_KEY): Promise<TrainingRun> {
  const result = await service.createTrainingRun({ spec, requestKey, quoteId: null }, ctx);
  if (!result.ok) throw new Error(result.error.message);
  return result.data;
}

describe("dataset inspection", () => {
  const encode = (text: string) => new TextEncoder().encode(text);

  it("accepts conversational JSONL and counts examples", () => {
    const row = '{"messages":[{"role":"user","content":"q"},{"role":"assistant","content":"a"}]}';
    expect(inspectDataset(encode(`${row}\n${row}\n`))).toEqual({ format: "conversational", exampleCount: 2, issues: [] });
  });

  it("rejects a conversation that does not end with assistant, without echoing content", () => {
    const result = inspectDataset(encode('{"messages":[{"role":"user","content":"SECRET-TEXT"}]}'));
    expect(result.issues).toEqual(["Line 1: the last message must be from assistant"]);
    expect(JSON.stringify(result)).not.toContain("SECRET-TEXT");
  });

  it("rejects mixed formats and empty files", () => {
    expect(inspectDataset(encode('{"text":"a"}\n{"prompt":"p","completion":"c"}')).issues).toHaveLength(1);
    expect(inspectDataset(encode("\n")).issues).toEqual(["No training examples"]);
  });
});

describe("training conditions", () => {
  it("blocks a paid run with no price and never calls the provider", async () => {
    const noPrice: PriceProvider = { id: "nebius", trainingPrice: async () => null };
    service = createTrainingService({ store, provider, prices: noPrice, maxApprovedUsd: () => 10 });
    const dataset = await upload();
    const result = await service.createTrainingRun({ spec: specFor(dataset.datasetId), requestKey: JOB_KEY, quoteId: null }, ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("BLOCKED");
    expect(provider.uploadFile).not.toHaveBeenCalled();
    expect(provider.createJob).not.toHaveBeenCalled();
  });

  it("blocks without an operator cost ceiling and names the setting", async () => {
    service = createTrainingService({ store, provider, prices: priced, maxApprovedUsd: () => null });
    const dataset = await upload();
    const result = await service.validateTraining(specFor(dataset.datasetId), ctx);
    expect(result.ok && result.data.status).toBe("blocked");
    expect(result.ok && result.data.reasons.flatMap((item) => item.requiredConfig)).toContain("AA_TRAINING_MAX_USD");
  });

  it("blocks when the byte-based upper bound exceeds the user limit", async () => {
    const expensive: PriceProvider = { id: "nebius", trainingPrice: async () => ({ unitPrice: 1_000_000, currency: "USD", unit: "u", sourceUrl: "https://example.com/p", note: "n" }) };
    service = createTrainingService({ store, provider, prices: expensive, maxApprovedUsd: () => 10 });
    const dataset = await upload();
    const result = await service.validateTraining(specFor(dataset.datasetId), ctx);
    expect(result.ok && result.data.reasons.map((item) => item.message)).toContain("The estimated maximum training cost exceeds the approved cost limit");
  });

  it("refuses models and methods outside the provider table, and unknown config keys", async () => {
    const dataset = await upload();
    const other = await service.validateTraining(specFor(dataset.datasetId, { baseModel: { ...baseModel, modelId: "x/y" } }), ctx);
    expect(other.ok && other.data.status).toBe("blocked");
    const qlora = await service.validateTraining(specFor(dataset.datasetId, { method: "qlora" }), ctx);
    expect(qlora.ok && qlora.data.status).toBe("blocked");
    const badConfig = await service.validateTraining(specFor(dataset.datasetId, { config: { api_token: "x" } }), ctx);
    expect(badConfig.ok && badConfig.data.status).toBe("blocked");
  });

  it("cannot see another owner's dataset", async () => {
    const dataset = await upload();
    const result = await service.validateTraining(specFor(dataset.datasetId), { ...ctx, ownerId: "owner-b" });
    expect(result.ok && result.data.reasons.map((item) => item.message)).toContain("Training data not found");
  });
});

describe("creating a run", () => {
  it("stores the provider's real id, and sends the reconciliation suffix", async () => {
    const dataset = await upload();
    const run = await createRun(specFor(dataset.datasetId));
    expect(run).toMatchObject({ providerJobId: "ftjob-real", status: "queued" });
    expect(provider.createJob).toHaveBeenCalledWith(expect.objectContaining({ suffix: SUFFIX, trainingFileId: "file-real", model: baseModel.modelId }));
    expect(SUFFIX.length).toBeLessThanOrEqual(64);
  });

  it("returns the same run for a repeated key and creates one job", async () => {
    const dataset = await upload();
    const first = await createRun(specFor(dataset.datasetId));
    const second = await createRun(specFor(dataset.datasetId));
    expect(second.runId).toBe(first.runId);
    expect(provider.createJob).toHaveBeenCalledTimes(1);
  });

  it("rejects a repeated key with a different body", async () => {
    const dataset = await upload();
    await createRun(specFor(dataset.datasetId));
    const result = await service.createTrainingRun({ spec: specFor(dataset.datasetId, { config: { n_epochs: 2 } }), requestKey: JOB_KEY, quoteId: null }, ctx);
    expect(!result.ok && result.error.code).toBe("CONFLICT");
  });

  it("marks an ambiguous create status_unknown and does not resubmit", async () => {
    provider.createJob.mockResolvedValue(indeterminate);
    const dataset = await upload();
    const run = await createRun(specFor(dataset.datasetId));
    expect(run).toMatchObject({ status: "status_unknown", providerJobId: null });

    const again = await service.getTrainingRun(run.runId, ctx);
    expect(again.ok && again.data.status).toBe("status_unknown");
    expect(provider.createJob).toHaveBeenCalledTimes(1);
  });

  it("adopts the real job when reconciliation finds the suffix", async () => {
    provider.createJob.mockResolvedValue(indeterminate);
    const dataset = await upload();
    const run = await createRun(specFor(dataset.datasetId));
    provider.listJobs.mockResolvedValue({ ok: true, data: { jobs: [job({ suffix: "other", id: "x" }), job()], hasMore: false } });

    const found = await service.getTrainingRun(run.runId, ctx);
    expect(found.ok && found.data).toMatchObject({ providerJobId: "ftjob-real", status: "running" });
    expect(provider.createJob).toHaveBeenCalledTimes(1);
  });

  it("marks a definite rejection failed, not unknown", async () => {
    provider.createJob.mockResolvedValue(rejected);
    const dataset = await upload();
    const run = await createRun(specFor(dataset.datasetId));
    expect(run).toMatchObject({ status: "failed", providerJobId: null });
  });

  it("fails without creating a job when the file upload fails", async () => {
    provider.uploadFile.mockResolvedValue(indeterminate);
    const dataset = await upload();
    const run = await createRun(specFor(dataset.datasetId));
    expect(run.status).toBe("failed");
    expect(provider.createJob).not.toHaveBeenCalled();
  });
});

describe("following a run", () => {
  async function runningRun() {
    const dataset = await upload();
    return createRun(specFor(dataset.datasetId));
  }

  it("keeps the last observed status on a failed poll and records the error", async () => {
    const run = await runningRun();
    provider.getJob.mockResolvedValue(indeterminate);
    const result = await service.getTrainingRun(run.runId, ctx);
    expect(result.ok && result.data.status).toBe("queued");
    expect(result.ok && result.data.pollError?.code).toBe("PROVIDER_TIMEOUT");
    expect(result.ok && result.data.lastObservedAt).toBe(run.lastObservedAt);
  });

  it("shows progress only when the provider reports it", async () => {
    const run = await runningRun();
    expect((await service.getTrainingRun(run.runId, ctx)).ok && run.statusReason).toBeNull();
    provider.getJob.mockResolvedValue({ ok: true, data: job({ trainedSteps: 3, totalSteps: 10 }) });
    const result = await service.getTrainingRun(run.runId, ctx);
    expect(result.ok && result.data.statusReason).toContain("3/10");
  });

  it("stays verifying_artifact on success until files are actually observed", async () => {
    const run = await runningRun();
    provider.getJob.mockResolvedValue({ ok: true, data: job({ status: "succeeded", resultFiles: [] }) });
    const result = await service.getTrainingRun(run.runId, ctx);
    expect(result.ok && result.data).toMatchObject({ status: "verifying_artifact", trainingCompleted: true, artifactId: null, runtimeReady: false });
  });

  it("completes only after the result file is observed, and keeps runtime false", async () => {
    const run = await runningRun();
    provider.getJob.mockResolvedValue({ ok: true, data: job({ status: "succeeded" }) });
    provider.listCheckpoints.mockResolvedValue({ ok: true, data: [{ id: "ck1", stepNumber: 1, modelName: "ft:m", resultFiles: ["out"] }] });
    const result = await service.getTrainingRun(run.runId, ctx);
    expect(result.ok && result.data).toMatchObject({ status: "completed", runtimeReady: false, evaluationResult: null });
    expect(result.ok && result.data.artifactId).toBe(`art_${run.runId}`);
    expect(store.get<{ artifact: { kind: string; existenceVerified: boolean } }>(COLLECTIONS.artifacts, OWNER, `art_${run.runId}`)?.value.artifact).toMatchObject({
      kind: "lora_adapter",
      existenceVerified: true,
    });
  });

  it("hides runs from other owners", async () => {
    const run = await runningRun();
    const result = await service.getTrainingRun(run.runId, { ...ctx, ownerId: "owner-b" });
    expect(!result.ok && result.error.code).toBe("NOT_FOUND");
  });
});

describe("canceling", () => {
  async function runningRun() {
    const dataset = await upload();
    return createRun(specFor(dataset.datasetId));
  }

  it("confirms only when the provider reports cancelled", async () => {
    const run = await runningRun();
    const result = await service.cancelTrainingRun(run.runId, ctx);
    expect(result.ok && result.data.status).toBe("canceled");
  });

  it("stays cancel_requested when the provider has not stopped", async () => {
    const run = await runningRun();
    provider.cancelJob.mockResolvedValue({ ok: true, data: job({ status: "running" }) });
    const result = await service.cancelTrainingRun(run.runId, ctx);
    expect(result.ok && result.data.status).toBe("cancel_requested");
  });

  it("records the provider's real final state when completion beats cancel", async () => {
    const run = await runningRun();
    provider.cancelJob.mockResolvedValue({ ok: true, data: job({ status: "running" }) });
    await service.cancelTrainingRun(run.runId, ctx);
    provider.getJob.mockResolvedValue({ ok: true, data: job({ status: "succeeded" }) });
    const result = await service.getTrainingRun(run.runId, ctx);
    expect(result.ok && result.data.status).toBe("verifying_artifact");
  });

  it("keeps cancel_requested with an error when the cancel outcome is unknown", async () => {
    const run = await runningRun();
    provider.cancelJob.mockResolvedValue(indeterminate);
    const result = await service.cancelTrainingRun(run.runId, ctx);
    expect(result.ok && result.data).toMatchObject({ status: "cancel_requested", pollError: { code: "PROVIDER_TIMEOUT" } });
  });

  it("restores the prior status when the provider rejects the cancel", async () => {
    const run = await runningRun();
    provider.cancelJob.mockResolvedValue(rejected);
    const result = await service.cancelTrainingRun(run.runId, ctx);
    expect(result.ok).toBe(false);
    const after = await service.listTrainingRuns(ctx);
    expect(after.ok && after.data.runs[0].status).toBe("queued");
  });

  it("refuses to cancel a run whose provider job is unknown", async () => {
    provider.createJob.mockResolvedValue(indeterminate);
    const run = await runningRun();
    const result = await service.cancelTrainingRun(run.runId, ctx);
    expect(!result.ok && result.error.code).toBe("BLOCKED");
    expect(provider.cancelJob).not.toHaveBeenCalled();
  });
});

describe("price quotes", () => {
  const request = { baseModel, method: "lora" as const, provider: null, region: null, gpuType: null, estimatedHours: null };

  it("returns null price and fetch_failed when no price is known, never zero", async () => {
    const pricing = createPricingService({ store, prices: { id: "nebius", trainingPrice: async () => null } });
    const result = await pricing.getPriceQuote(request, ctx);
    expect(result.ok && result.data).toMatchObject({ unitPrice: null, currency: null, unit: null, estimatedTotal: null, freshness: "fetch_failed" });
  });

  it("returns null price when the lookup throws", async () => {
    const pricing = createPricingService({ store, prices: { id: "nebius", trainingPrice: async () => { throw new Error("down"); } } });
    const result = await pricing.getPriceQuote(request, ctx);
    expect(result.ok && result.data).toMatchObject({ unitPrice: null, freshness: "fetch_failed" });
    expect(result.ok && result.data.notes).toContain("failed");
  });

  it("labels a known price with its unit and keeps it out of live freshness", async () => {
    const pricing = createPricingService({ store, prices: priced });
    const result = await pricing.getPriceQuote(request, ctx);
    expect(result.ok && result.data).toMatchObject({ unitPrice: 1, currency: "USD", unit: "per_1m_training_tokens", freshness: "published_doc" });
  });

  it("refuses a model the provider does not list", async () => {
    const pricing = createPricingService({ store, prices: priced });
    const result = await pricing.getPriceQuote({ ...request, baseModel: { ...baseModel, modelId: "x/y" } }, ctx);
    expect(!result.ok && result.error.code).toBe("UNSUPPORTED");
  });
});
