import "server-only";
import { z } from "zod";
import { NEBIUS_KEY_NAME, NEBIUS_PROVIDER_ID, hasNebiusKey, nebiusRequest, type NebiusResult } from "@/server/llm/nebius";
import type { TrainingMethod } from "@/shared/contracts";

export type ProviderResult<T> = NebiusResult<T>;

export type ProviderJobStatus = "validating" | "queued" | "running" | "succeeded" | "failed" | "cancelled";

export interface ProviderJob {
  id: string;
  status: ProviderJobStatus;
  suffix: string | null;
  errorMessage: string | null;
  resultFiles: string[];
  trainedSteps: number | null;
  totalSteps: number | null;
}

export interface ProviderCheckpoint {
  id: string;
  stepNumber: number;
  modelName: string;
  resultFiles: string[];
}

export interface ProviderFile {
  id: string;
  filename: string;
  bytes: number;
}

export interface CreateProviderJob {
  model: string;
  trainingFileId: string;
  /** Echoed by the provider. It is the only way to find a job after an unknown create. */
  suffix: string;
  method: TrainingMethod;
  hyperparameters: Record<string, unknown>;
}

/** Everything the training service needs from a provider. Tests inject their own. */
export interface TrainingProvider {
  id: string;
  requiredConfig: string[];
  isConfigured(): boolean;
  uploadFile(fileName: string, bytes: Uint8Array): Promise<ProviderResult<{ id: string }>>;
  createJob(input: CreateProviderJob): Promise<ProviderResult<ProviderJob>>;
  getJob(jobId: string, signal: AbortSignal): Promise<ProviderResult<ProviderJob>>;
  listJobs(after: string | null, signal: AbortSignal): Promise<ProviderResult<{ jobs: ProviderJob[]; hasMore: boolean }>>;
  cancelJob(jobId: string): Promise<ProviderResult<ProviderJob>>;
  listCheckpoints(jobId: string, signal: AbortSignal): Promise<ProviderResult<ProviderCheckpoint[]>>;
  getFile(fileId: string, signal: AbortSignal): Promise<ProviderResult<ProviderFile>>;
}

const JOB_STATUS: Record<string, ProviderJobStatus> = {
  validating_files: "validating",
  queued: "queued",
  running: "running",
  succeeded: "succeeded",
  failed: "failed",
  cancelled: "cancelled",
};

const Job = z
  .object({
    id: z.string().min(1),
    status: z.string().refine((value) => value in JOB_STATUS),
    suffix: z.string().nullish(),
    error: z.object({ message: z.string().nullish() }).nullish(),
    result_files: z.array(z.string()).nullish(),
    trained_steps: z.number().nullish(),
    total_steps: z.number().nullish(),
  })
  .transform(
    (job): ProviderJob => ({
      id: job.id,
      status: JOB_STATUS[job.status],
      suffix: job.suffix ?? null,
      errorMessage: job.error?.message ?? null,
      resultFiles: job.result_files ?? [],
      trainedSteps: job.trained_steps ?? null,
      totalSteps: job.total_steps ?? null,
    }),
  );

const FILE_TIMEOUT_MS = 300_000;

function segment(value: string): string {
  return encodeURIComponent(value);
}

export const nebiusTrainingProvider: TrainingProvider = {
  id: NEBIUS_PROVIDER_ID,
  requiredConfig: [NEBIUS_KEY_NAME],
  isConfigured: hasNebiusKey,

  uploadFile(fileName, bytes) {
    const form = new FormData();
    form.set("purpose", "fine-tune");
    form.set("file", new File([bytes as BlobPart], fileName, { type: "application/jsonl" }));
    return nebiusRequest("/files", z.object({ id: z.string().min(1) }), { method: "POST", form, timeoutMs: FILE_TIMEOUT_MS });
  },

  createJob(input) {
    return nebiusRequest("/fine_tuning/jobs", Job, {
      method: "POST",
      json: {
        model: input.model,
        training_file: input.trainingFileId,
        suffix: input.suffix,
        hyperparameters: { ...input.hyperparameters, lora: input.method === "lora" },
      },
    });
  },

  getJob: (jobId, signal) => nebiusRequest(`/fine_tuning/jobs/${segment(jobId)}`, Job, { signal }),

  async listJobs(after, signal) {
    const query = new URLSearchParams({ limit: "100" });
    if (after) query.set("after", after);
    const result = await nebiusRequest(
      `/fine_tuning/jobs?${query}`,
      z.object({ data: z.array(Job), has_more: z.boolean() }),
      { signal },
    );
    return result.ok ? { ok: true, data: { jobs: result.data.data, hasMore: result.data.has_more } } : result;
  },

  cancelJob: (jobId) => nebiusRequest(`/fine_tuning/jobs/${segment(jobId)}/cancel`, Job, { method: "POST" }),

  async listCheckpoints(jobId, signal) {
    const result = await nebiusRequest(
      `/fine_tuning/jobs/${segment(jobId)}/checkpoints`,
      z.object({
        data: z.array(
          z.object({
            id: z.string(),
            step_number: z.number(),
            fine_tuned_model_checkpoint: z.string(),
            result_files: z.array(z.string()).nullish(),
          }),
        ),
      }),
      { signal },
    );
    if (!result.ok) return result;
    return {
      ok: true,
      data: result.data.data.map((item) => ({
        id: item.id,
        stepNumber: item.step_number,
        modelName: item.fine_tuned_model_checkpoint,
        resultFiles: item.result_files ?? [],
      })),
    };
  },

  getFile: (fileId, signal) =>
    nebiusRequest(
      `/files/${segment(fileId)}`,
      z.object({ id: z.string(), filename: z.string(), bytes: z.number() }),
      { signal },
    ),
};
