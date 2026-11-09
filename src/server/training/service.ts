import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { ArtifactRecord } from "@/server/artifacts/service";
import type { PriceProvider } from "@/server/pricing/service";
import { COLLECTIONS, RevisionConflictError, type Doc, type Store } from "@/server/store/store";
import {
  TERMINAL_TRAINING_STATUSES,
  fail,
  ok,
  type ApiError,
  type CreateTrainingRunRequest,
  type RequestContext,
  type ServiceResult,
  type TrainingDataset,
  type TrainingRun,
  type TrainingRunList,
  type TrainingSpec,
  type TrainingValidation,
} from "@/shared/contracts";
import { inspectDataset } from "./dataset";
import { nebiusMethodsFor } from "./nebiusModels";
import type { ProviderJob, ProviderResult, TrainingProvider } from "./provider";

/** Local store limit. The provider's own file limit is far higher. */
export const MAX_DATASET_BYTES = 64 * 1024 * 1024;
export const TRAINING_MAX_USD_ENV = "AA_TRAINING_MAX_USD";

const DEFAULT_EPOCHS = 3;
const MAX_RECONCILE_PAGES = 5;
const MAX_VERIFIED_FILES = 50;
const STALE_SUBMIT_MS = 5 * 60_000;
const MAX_PROVIDER_TEXT = 500;

/** Bounds from the Nebius create-job schema. Unknown keys are refused, not forwarded. */
const Hyperparameters = z.strictObject({
  batch_size: z.number().int().min(1).max(64).optional(),
  learning_rate: z.number().min(0).optional(),
  n_epochs: z.number().int().min(1).max(20).optional(),
  warmup_ratio: z.number().min(0).max(1).optional(),
  weight_decay: z.number().min(0).optional(),
  packing: z.boolean().optional(),
  max_grad_norm: z.number().gt(0).optional(),
  context_length: z.number().int().min(8192).max(131072).optional(),
  lora_r: z.number().int().min(8).max(128).optional(),
  lora_alpha: z.number().int().min(8).optional(),
  lora_dropout: z.number().min(0).max(1).optional(),
});

interface TrainingRequestRecord {
  runId: string;
  fingerprint: string;
}

export interface TrainingDeps {
  store: Store;
  provider: TrainingProvider;
  prices: PriceProvider;
  /** Operator-approved ceiling for one run in USD. null blocks every paid run. */
  maxApprovedUsd: () => number | null;
}

export function readMaxApprovedUsd(): number | null {
  const value = Number(process.env[TRAINING_MAX_USD_ENV]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function datasetBlobId(datasetId: string): string {
  return `dataset:${datasetId}`;
}

function fingerprintOf(spec: TrainingSpec): string {
  return createHash("sha256").update(JSON.stringify(spec)).digest("hex");
}

/** Hex only: the provider states a length limit but no allowed character set. */
function suffixFor(requestKey: string): string {
  return `aa-${requestKey.replaceAll("-", "")}`;
}

function isTerminal(run: TrainingRun): boolean {
  return TERMINAL_TRAINING_STATUSES.includes(run.status);
}

function providerText(value: string | null): string | null {
  return value ? value.slice(0, MAX_PROVIDER_TEXT) : null;
}

function reason(code: ApiError["code"], message: string, requiredConfig: string[] = []): ApiError {
  return fail(code, message, { requiredConfig }).error;
}

function progressText(job: ProviderJob): string | null {
  return job.trainedSteps !== null && job.totalSteps !== null
    ? `Provider-reported progress: ${job.trainedSteps}/${job.totalSteps} steps`
    : null;
}

export function createTrainingService({ store, provider, prices, maxApprovedUsd }: TrainingDeps) {
  const now = () => new Date().toISOString();

  /** A lost race means another request already saved newer facts, so keep those. */
  function save(doc: Doc<TrainingRun>, next: TrainingRun): TrainingRun {
    try {
      return store.put(COLLECTIONS.trainingRuns, doc.ownerId, doc.id, next, { expectedRevision: doc.revision }).value;
    } catch (error) {
      if (error instanceof RevisionConflictError) {
        return store.get<TrainingRun>(COLLECTIONS.trainingRuns, doc.ownerId, doc.id)?.value ?? next;
      }
      throw error;
    }
  }

  function loadDataset(datasetId: string, ctx: RequestContext): TrainingDataset | null {
    return store.get<TrainingDataset>(COLLECTIONS.datasets, ctx.ownerId, datasetId)?.value ?? null;
  }

  async function costReasons(spec: TrainingSpec, dataset: TrainingDataset | null, epochs: number): Promise<ApiError[]> {
    const ceiling = maxApprovedUsd();
    if (ceiling === null) {
      return [reason("BLOCKED", "There is no server-approved cost limit for paid training", [TRAINING_MAX_USD_ENV])];
    }
    if (spec.costLimit.currency !== "USD") return [reason("BLOCKED", "The cost limit must be in USD")];
    if (spec.costLimit.amount > ceiling) return [reason("BLOCKED", "The requested cost limit exceeds the server-approved limit")];

    let price;
    try {
      price = await prices.trainingPrice(spec.baseModel.modelId);
    } catch {
      return [reason("BLOCKED", "Training price lookup failed so the cost limit cannot be checked")];
    }
    if (!price) return [reason("BLOCKED", "Training price is unconfirmed so the cost limit cannot be verified")];
    if (!dataset) return [];

    // UTF-8 bytes bound the token count from above: a token spans at least one byte.
    const estimatedMaxUsd = (dataset.sizeBytes * epochs * price.unitPrice) / 1_000_000;
    return estimatedMaxUsd > spec.costLimit.amount
      ? [reason("BLOCKED", "The estimated maximum training cost exceeds the approved cost limit")]
      : [];
  }

  async function checkSpec(spec: TrainingSpec, ctx: RequestContext): Promise<TrainingValidation> {
    const reasons: ApiError[] = [];

    if (spec.provider !== provider.id) reasons.push(reason("UNSUPPORTED", `Provider is not connected: ${spec.provider}`));
    if (!provider.isConfigured()) reasons.push(reason("NOT_CONNECTED", "Training provider connection details are missing", provider.requiredConfig));

    const methods = nebiusMethodsFor(spec.baseModel.modelId);
    if (methods.length === 0) reasons.push(reason("UNSUPPORTED", "This model is not on the provider's fine-tuning support list"));
    else if (!methods.includes(spec.method)) reasons.push(reason("UNSUPPORTED", `This model does not support the ${spec.method} method`));

    const dataset = loadDataset(spec.datasetId, ctx);
    if (!dataset) reasons.push(reason("BLOCKED", "Training data not found"));
    else if (dataset.validation !== "valid") reasons.push(reason("BLOCKED", "Training data failed validation"));

    const config = Hyperparameters.safeParse(spec.config);
    if (!config.success) reasons.push(reason("INVALID_REQUEST", "Training config is outside the range the provider allows"));

    reasons.push(...(await costReasons(spec, dataset, config.success ? (config.data.n_epochs ?? DEFAULT_EPOCHS) : DEFAULT_EPOCHS)));
    return { status: reasons.length === 0 ? "ready" : "blocked", reasons, checkedAt: now() };
  }

  function replayRequest(record: TrainingRequestRecord, spec: TrainingSpec, ctx: RequestContext): ServiceResult<TrainingRun> {
    if (record.fingerprint !== fingerprintOf(spec)) return fail("CONFLICT", "The same request key was sent with different training details");
    const run = store.get<TrainingRun>(COLLECTIONS.trainingRuns, ctx.ownerId, record.runId);
    return run ? ok(run.value) : fail("STATUS_UNKNOWN", "The request was accepted but the training record could not be read");
  }

  function applyJob(run: TrainingRun, job: ProviderJob, observedAt: string): TrainingRun {
    const observed: TrainingRun = { ...run, providerJobId: job.id, lastObservedAt: observedAt, pollError: null, updatedAt: observedAt };
    switch (job.status) {
      case "validating":
      case "queued":
      case "running": {
        // A pending cancel stays visible until the provider reports a final state.
        if (run.status === "cancel_requested") return { ...observed, statusReason: progressText(job) };
        return { ...observed, status: job.status, statusReason: progressText(job) };
      }
      case "succeeded":
        return { ...observed, status: "verifying_artifact", trainingCompleted: true, statusReason: "The provider reported training success · verifying the artifact" };
      case "failed":
        return { ...observed, status: "failed", statusReason: providerText(job.errorMessage) ?? "The provider reported failure" };
      case "cancelled":
        return { ...observed, status: "canceled", statusReason: "The provider confirmed the cancellation" };
    }
  }

  async function verifyArtifact(run: TrainingRun, job: ProviderJob, ctx: RequestContext): Promise<TrainingRun> {
    const fallbackReason = (statusReason: string): TrainingRun => ({ ...run, status: "verifying_artifact", statusReason });

    const checkpoints = await provider.listCheckpoints(job.id, ctx.signal);
    if (!checkpoints.ok) return fallbackReason("The artifact list could not be confirmed yet");

    const latest = checkpoints.data.reduce<(typeof checkpoints.data)[number] | null>(
      (best, item) => (best === null || item.stepNumber > best.stepNumber ? item : best),
      null,
    );
    const fileIds = latest?.resultFiles.length ? latest.resultFiles : job.resultFiles;
    if (fileIds.length === 0) return fallbackReason("The provider has not reported result files yet");

    const filenames: string[] = [];
    for (const fileId of fileIds.slice(0, MAX_VERIFIED_FILES)) {
      const file = await provider.getFile(fileId, ctx.signal);
      if (!file.ok) return fallbackReason("A result file could not be confirmed yet");
      if (file.data.bytes <= 0) return fallbackReason("A result file is empty");
      filenames.push(file.data.filename);
    }

    const verifiedAt = now();
    const isAdapter = filenames.some((name) => name.endsWith("adapter_config.json"));
    const artifactId = `art_${run.runId}`;
    const record: ArtifactRecord = {
      artifact: {
        artifactId,
        runId: run.runId,
        baseModel: run.spec.baseModel,
        kind: isAdapter ? "lora_adapter" : run.spec.method === "full" ? "full_weights" : "unknown",
        providerArtifactId: latest?.modelName ?? null,
        uri: latest ? `nebius:checkpoint:${latest.id}` : `nebius:file:${fileIds[0]}`,
        existenceVerified: true,
        verifiedAt,
      },
      runtime: { artifactId, state: "not_loaded", responseVerifiedAt: null, error: null, updatedAt: verifiedAt },
      fileIds,
    };
    store.put(COLLECTIONS.artifacts, ctx.ownerId, artifactId, record);
    return { ...run, status: "completed", artifactId, statusReason: "Result files confirmed · model availability must be checked separately", updatedAt: verifiedAt };
  }

  async function finishApplyingJob(applied: TrainingRun, job: ProviderJob, ctx: RequestContext): Promise<TrainingRun> {
    return job.status === "succeeded" ? verifyArtifact(applied, job, ctx) : applied;
  }

  /** Finds a job whose create outcome is unknown. Never creates a new one. */
  async function reconcile(run: TrainingRun, ctx: RequestContext): Promise<ProviderResult<ProviderJob | null>> {
    const suffix = suffixFor(run.requestKey);
    let after: string | null = null;
    for (let page = 0; page < MAX_RECONCILE_PAGES; page += 1) {
      const result = await provider.listJobs(after, ctx.signal);
      if (!result.ok) return result;
      const match = result.data.jobs.find((job) => job.suffix === suffix);
      if (match) return { ok: true, data: match };
      if (!result.data.hasMore || result.data.jobs.length === 0) break;
      after = result.data.jobs.at(-1)!.id;
    }
    return { ok: true, data: null };
  }

  async function refresh(doc: Doc<TrainingRun>, ctx: RequestContext): Promise<TrainingRun> {
    let run = doc.value;
    if (isTerminal(run)) return run;

    if (run.status === "submitting") {
      if (Date.now() - new Date(run.updatedAt).getTime() < STALE_SUBMIT_MS) return run;
      run = { ...run, status: "status_unknown", statusReason: "Training request processing was interrupted so the outcome is unknown", updatedAt: now() };
    }

    if (run.providerJobId === null) {
      if (run.status !== "status_unknown") return run;
      const found = await reconcile(run, ctx);
      if (!found.ok) return save(doc, { ...run, pollError: found.error, updatedAt: now() });
      if (found.data === null) {
        return save(doc, { ...run, pollError: null, statusReason: "No matching job was found at the provider · not requesting again automatically", updatedAt: now() });
      }
      return save(doc, await finishApplyingJob(applyJob(run, found.data, now()), found.data, ctx));
    }

    const job = await provider.getJob(run.providerJobId, ctx.signal);
    // A failed poll changes nothing the provider reported: only the error is recorded.
    if (!job.ok) return save(doc, { ...run, pollError: job.error, updatedAt: now() });
    return save(doc, await finishApplyingJob(applyJob(run, job.data, now()), job.data, ctx));
  }

  return {
    async uploadDataset(form: FormData, ctx: RequestContext): Promise<ServiceResult<TrainingDataset>> {
      const file = form.get("file");
      if (!(file instanceof File)) return fail("INVALID_REQUEST", "A training data file is required");
      if (file.size > MAX_DATASET_BYTES) return fail("PAYLOAD_TOO_LARGE", "Training data must be 64MB or smaller");

      const bytes = new Uint8Array(await file.arrayBuffer());
      const inspection = inspectDataset(bytes);
      const isValid = inspection.issues.length === 0;
      const dataset: TrainingDataset = {
        datasetId: randomUUID(),
        fileName: (file.name.split(/[\\/]/).pop() || "dataset.jsonl").slice(0, 255),
        sizeBytes: bytes.byteLength,
        format: inspection.format,
        exampleCount: inspection.exampleCount,
        validation: isValid ? "valid" : "invalid",
        issues: inspection.issues,
        createdAt: now(),
      };
      if (isValid) store.putBlob(ctx.ownerId, datasetBlobId(dataset.datasetId), { mimeType: "application/jsonl", bytes });
      store.put(COLLECTIONS.datasets, ctx.ownerId, dataset.datasetId, dataset);
      return ok(dataset);
    },

    async validateTraining(spec: TrainingSpec, ctx: RequestContext): Promise<ServiceResult<TrainingValidation>> {
      return ok(await checkSpec(spec, ctx));
    },

    async createTrainingRun(input: CreateTrainingRunRequest, ctx: RequestContext): Promise<ServiceResult<TrainingRun>> {
      const { spec, requestKey } = input;
      const existing = store.get<TrainingRequestRecord>(COLLECTIONS.trainingRequests, ctx.ownerId, requestKey);
      if (existing) return replayRequest(existing.value, spec, ctx);

      const validation = await checkSpec(spec, ctx);
      if (validation.status === "blocked") {
        return fail("BLOCKED", validation.reasons.map((item) => item.message).join(" "), {
          requiredConfig: [...new Set(validation.reasons.flatMap((item) => item.requiredConfig))],
        });
      }

      // Claim the key before any provider call, so a duplicate can never reach it.
      const runId = randomUUID();
      const claim = store.insertIfAbsent<TrainingRequestRecord>(COLLECTIONS.trainingRequests, ctx.ownerId, requestKey, {
        runId,
        fingerprint: fingerprintOf(spec),
      });
      if (!claim.created) return replayRequest(claim.doc.value, spec, ctx);

      const createdAt = now();
      let doc = store.put<TrainingRun>(COLLECTIONS.trainingRuns, ctx.ownerId, runId, {
        runId,
        providerJobId: null,
        status: "submitting",
        statusReason: null,
        requestKey,
        spec,
        artifactId: null,
        trainingCompleted: false,
        runtimeReady: false,
        evaluationResult: null,
        lastObservedAt: null,
        pollError: null,
        createdAt,
        updatedAt: createdAt,
      });

      const dataset = loadDataset(spec.datasetId, ctx);
      const blob = store.getBlob(ctx.ownerId, datasetBlobId(spec.datasetId));
      if (!dataset || !blob) {
        return ok(save(doc, { ...doc.value, status: "failed", statusReason: "Training data could not be read", updatedAt: now() }));
      }

      const upload = await provider.uploadFile(dataset.fileName, blob.bytes);
      if (!upload.ok) {
        // No job exists yet, so this is a definite failure even after a timeout.
        return ok(save(doc, { ...doc.value, status: "failed", statusReason: `Training data upload failed: ${upload.error.message}`, updatedAt: now() }));
      }
      doc = store.get<TrainingRun>(COLLECTIONS.trainingRuns, ctx.ownerId, runId) ?? doc;

      const created = await provider.createJob({
        model: spec.baseModel.modelId,
        trainingFileId: upload.data.id,
        suffix: suffixFor(requestKey),
        method: spec.method,
        hyperparameters: Hyperparameters.parse(spec.config),
      });

      if (!created.ok) {
        const unknown = created.outcome === "indeterminate";
        return ok(
          save(doc, {
            ...doc.value,
            status: unknown ? "status_unknown" : "failed",
            statusReason: unknown ? "The training request outcome is unknown · checking for an existing job" : created.error.message,
            pollError: unknown ? created.error : null,
            updatedAt: now(),
          }),
        );
      }
      return ok(save(doc, await finishApplyingJob(applyJob(doc.value, created.data, now()), created.data, ctx)));
    },

    async listTrainingRuns(ctx: RequestContext): Promise<ServiceResult<TrainingRunList>> {
      return ok({ runs: store.list<TrainingRun>(COLLECTIONS.trainingRuns, ctx.ownerId).map((doc) => doc.value) });
    },

    async getTrainingRun(runId: string, ctx: RequestContext): Promise<ServiceResult<TrainingRun>> {
      const doc = store.get<TrainingRun>(COLLECTIONS.trainingRuns, ctx.ownerId, runId);
      return doc ? ok(await refresh(doc, ctx)) : fail("NOT_FOUND", "Training record not found");
    },

    async cancelTrainingRun(runId: string, ctx: RequestContext): Promise<ServiceResult<TrainingRun>> {
      const doc = store.get<TrainingRun>(COLLECTIONS.trainingRuns, ctx.ownerId, runId);
      if (!doc) return fail("NOT_FOUND", "Training record not found");
      if (isTerminal(doc.value)) return ok(doc.value);

      const current = doc.value.providerJobId === null ? await refresh(doc, ctx) : doc.value;
      if (current.providerJobId === null) return fail("BLOCKED", "Cannot cancel because the provider job could not be confirmed");
      if (isTerminal(current)) return ok(current);

      const latest = store.get<TrainingRun>(COLLECTIONS.trainingRuns, ctx.ownerId, runId) ?? doc;
      const requested = store.put<TrainingRun>(COLLECTIONS.trainingRuns, ctx.ownerId, runId, {
        ...latest.value,
        status: "cancel_requested",
        statusReason: "Cancel requested · waiting for provider confirmation",
        updatedAt: now(),
      });

      const cancelled = await provider.cancelJob(current.providerJobId);
      if (!cancelled.ok) {
        if (cancelled.outcome === "indeterminate") {
          return ok(save(requested, { ...requested.value, pollError: cancelled.error, updatedAt: now() }));
        }
        save(requested, { ...requested.value, status: latest.value.status, statusReason: latest.value.statusReason, updatedAt: now() });
        return { ok: false, error: cancelled.error };
      }
      return ok(save(requested, await finishApplyingJob(applyJob(requested.value, cancelled.data, now()), cancelled.data, ctx)));
    },
  };
}
