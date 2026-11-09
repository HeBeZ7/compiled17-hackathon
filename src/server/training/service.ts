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
    ? `공급자 보고 진행: ${job.trainedSteps}/${job.totalSteps} 스텝`
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
      return [reason("BLOCKED", "유료 학습에 승인된 서버 비용 한도가 없습니다.", [TRAINING_MAX_USD_ENV])];
    }
    if (spec.costLimit.currency !== "USD") return [reason("BLOCKED", "비용 한도는 USD로 지정해야 합니다.")];
    if (spec.costLimit.amount > ceiling) return [reason("BLOCKED", "요청한 비용 한도가 승인된 서버 한도를 넘습니다.")];

    let price;
    try {
      price = await prices.trainingPrice(spec.baseModel.modelId);
    } catch {
      return [reason("BLOCKED", "학습 단가 조회에 실패해 비용 한도를 확인할 수 없습니다.")];
    }
    if (!price) return [reason("BLOCKED", "학습 단가를 확인하지 못해 비용 한도를 검증할 수 없습니다.")];
    if (!dataset) return [];

    // UTF-8 bytes bound the token count from above: a token spans at least one byte.
    const estimatedMaxUsd = (dataset.sizeBytes * epochs * price.unitPrice) / 1_000_000;
    return estimatedMaxUsd > spec.costLimit.amount
      ? [reason("BLOCKED", "예상 최대 학습 비용이 승인한 비용 한도를 넘습니다.")]
      : [];
  }

  async function checkSpec(spec: TrainingSpec, ctx: RequestContext): Promise<TrainingValidation> {
    const reasons: ApiError[] = [];

    if (spec.provider !== provider.id) reasons.push(reason("UNSUPPORTED", `연결되지 않은 공급자입니다: ${spec.provider}`));
    if (!provider.isConfigured()) reasons.push(reason("NOT_CONNECTED", "학습 공급자 연결 정보가 없습니다.", provider.requiredConfig));

    const methods = nebiusMethodsFor(spec.baseModel.modelId);
    if (methods.length === 0) reasons.push(reason("UNSUPPORTED", "이 모델은 공급자의 파인튜닝 지원 목록에 없습니다."));
    else if (!methods.includes(spec.method)) reasons.push(reason("UNSUPPORTED", `이 모델은 ${spec.method} 방식을 지원하지 않습니다.`));

    const dataset = loadDataset(spec.datasetId, ctx);
    if (!dataset) reasons.push(reason("BLOCKED", "학습 자료를 찾을 수 없습니다."));
    else if (dataset.validation !== "valid") reasons.push(reason("BLOCKED", "학습 자료 검증을 통과하지 못했습니다."));

    const config = Hyperparameters.safeParse(spec.config);
    if (!config.success) reasons.push(reason("INVALID_REQUEST", "학습 설정이 공급자가 허용하는 범위를 벗어났습니다."));

    reasons.push(...(await costReasons(spec, dataset, config.success ? (config.data.n_epochs ?? DEFAULT_EPOCHS) : DEFAULT_EPOCHS)));
    return { status: reasons.length === 0 ? "ready" : "blocked", reasons, checkedAt: now() };
  }

  function replayRequest(record: TrainingRequestRecord, spec: TrainingSpec, ctx: RequestContext): ServiceResult<TrainingRun> {
    if (record.fingerprint !== fingerprintOf(spec)) return fail("CONFLICT", "같은 요청 키로 다른 학습 내용을 보냈습니다.");
    const run = store.get<TrainingRun>(COLLECTIONS.trainingRuns, ctx.ownerId, record.runId);
    return run ? ok(run.value) : fail("STATUS_UNKNOWN", "요청은 접수됐지만 학습 기록을 읽지 못했습니다.");
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
        return { ...observed, status: "verifying_artifact", trainingCompleted: true, statusReason: "공급자가 학습 성공을 보고했습니다. 결과물을 확인합니다." };
      case "failed":
        return { ...observed, status: "failed", statusReason: providerText(job.errorMessage) ?? "공급자가 실패를 보고했습니다." };
      case "cancelled":
        return { ...observed, status: "canceled", statusReason: "공급자가 취소를 확인했습니다." };
    }
  }

  async function verifyArtifact(run: TrainingRun, job: ProviderJob, ctx: RequestContext): Promise<TrainingRun> {
    const fallbackReason = (statusReason: string): TrainingRun => ({ ...run, status: "verifying_artifact", statusReason });

    const checkpoints = await provider.listCheckpoints(job.id, ctx.signal);
    if (!checkpoints.ok) return fallbackReason("결과물 목록을 아직 확인하지 못했습니다.");

    const latest = checkpoints.data.reduce<(typeof checkpoints.data)[number] | null>(
      (best, item) => (best === null || item.stepNumber > best.stepNumber ? item : best),
      null,
    );
    const fileIds = latest?.resultFiles.length ? latest.resultFiles : job.resultFiles;
    if (fileIds.length === 0) return fallbackReason("공급자가 결과 파일을 아직 보고하지 않았습니다.");

    const filenames: string[] = [];
    for (const fileId of fileIds.slice(0, MAX_VERIFIED_FILES)) {
      const file = await provider.getFile(fileId, ctx.signal);
      if (!file.ok) return fallbackReason("결과 파일을 아직 확인하지 못했습니다.");
      if (file.data.bytes <= 0) return fallbackReason("비어 있는 결과 파일이 있습니다.");
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
    return { ...run, status: "completed", artifactId, statusReason: "결과 파일 존재를 확인했습니다. 모델 사용 가능 여부는 별도로 확인해야 합니다.", updatedAt: verifiedAt };
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
      run = { ...run, status: "status_unknown", statusReason: "학습 요청 처리가 중단되어 결과를 알 수 없습니다.", updatedAt: now() };
    }

    if (run.providerJobId === null) {
      if (run.status !== "status_unknown") return run;
      const found = await reconcile(run, ctx);
      if (!found.ok) return save(doc, { ...run, pollError: found.error, updatedAt: now() });
      if (found.data === null) {
        return save(doc, { ...run, pollError: null, statusReason: "공급자에서 일치하는 작업을 찾지 못했습니다. 자동으로 다시 요청하지 않습니다.", updatedAt: now() });
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
      if (!(file instanceof File)) return fail("INVALID_REQUEST", "학습 자료 파일이 필요합니다.");
      if (file.size > MAX_DATASET_BYTES) return fail("PAYLOAD_TOO_LARGE", "학습 자료는 64MB 이하여야 합니다.");

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
        return ok(save(doc, { ...doc.value, status: "failed", statusReason: "학습 자료를 읽지 못했습니다.", updatedAt: now() }));
      }

      const upload = await provider.uploadFile(dataset.fileName, blob.bytes);
      if (!upload.ok) {
        // No job exists yet, so this is a definite failure even after a timeout.
        return ok(save(doc, { ...doc.value, status: "failed", statusReason: `학습 자료 업로드 실패: ${upload.error.message}`, updatedAt: now() }));
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
            statusReason: unknown ? "학습 요청의 결과를 알 수 없습니다. 기존 작업을 조회합니다." : created.error.message,
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
      return doc ? ok(await refresh(doc, ctx)) : fail("NOT_FOUND", "학습 기록을 찾을 수 없습니다.");
    },

    async cancelTrainingRun(runId: string, ctx: RequestContext): Promise<ServiceResult<TrainingRun>> {
      const doc = store.get<TrainingRun>(COLLECTIONS.trainingRuns, ctx.ownerId, runId);
      if (!doc) return fail("NOT_FOUND", "학습 기록을 찾을 수 없습니다.");
      if (isTerminal(doc.value)) return ok(doc.value);

      const current = doc.value.providerJobId === null ? await refresh(doc, ctx) : doc.value;
      if (current.providerJobId === null) return fail("BLOCKED", "공급자 작업을 확인하지 못해 취소할 수 없습니다.");
      if (isTerminal(current)) return ok(current);

      const latest = store.get<TrainingRun>(COLLECTIONS.trainingRuns, ctx.ownerId, runId) ?? doc;
      const requested = store.put<TrainingRun>(COLLECTIONS.trainingRuns, ctx.ownerId, runId, {
        ...latest.value,
        status: "cancel_requested",
        statusReason: "취소를 요청했습니다. 공급자 확인을 기다립니다.",
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
