import { z } from "zod";
import { IsoTimestamp } from "./common";
import { ApiError } from "./errors";
import { ModelReference } from "./model";

export const TrainingMethod = z.enum(["lora", "qlora", "full"]);
export type TrainingMethod = z.infer<typeof TrainingMethod>;

export const TrainingDataset = z.object({
  datasetId: z.string(),
  fileName: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  /** Format E verified against the provider. null until validated. */
  format: z.string().nullable(),
  exampleCount: z.number().int().nonnegative().nullable(),
  validation: z.enum(["pending", "valid", "invalid", "unknown"]),
  issues: z.array(z.string()),
  createdAt: IsoTimestamp,
});
export type TrainingDataset = z.infer<typeof TrainingDataset>;

export const TrainingSpec = z.object({
  agentId: z.uuid(),
  profileVersion: z.number().int().min(1),
  baseModel: ModelReference,
  method: TrainingMethod,
  datasetId: z.string().min(1),
  /** Settings the provider path was verified to accept. */
  config: z.record(z.string(), z.unknown()),
  provider: z.string().min(1),
  /** The server refuses to run without a user-approved limit. */
  costLimit: z.object({ currency: z.string().min(3), amount: z.number().positive() }),
});
export type TrainingSpec = z.infer<typeof TrainingSpec>;

export const TrainingValidation = z.object({
  status: z.enum(["ready", "blocked"]),
  reasons: z.array(ApiError),
  checkedAt: IsoTimestamp,
});
export type TrainingValidation = z.infer<typeof TrainingValidation>;

/** BUILD_PLAN §8. */
export const TrainingStatus = z.enum([
  "draft",
  "validating",
  "ready",
  "blocked",
  "submitting",
  "queued",
  "running",
  "cancel_requested",
  "canceled",
  "status_unknown",
  "verifying_artifact",
  "completed",
  "failed",
]);
export type TrainingStatus = z.infer<typeof TrainingStatus>;

export const TERMINAL_TRAINING_STATUSES: readonly TrainingStatus[] = ["canceled", "completed", "failed"];

export const TrainingEvaluation = z.object({
  summary: z.string(),
  /** Held-out data, separate from the training set (A-12). */
  evalDatasetId: z.string(),
  resultRef: z.string().nullable(),
  evaluatedAt: IsoTimestamp,
});
export type TrainingEvaluation = z.infer<typeof TrainingEvaluation>;

export const CreateTrainingRunRequest = z.object({
  spec: TrainingSpec,
  /** Client-generated and persisted before submit. Same key returns the same run. */
  requestKey: z.uuid(),
  quoteId: z.string().nullable(),
});
export type CreateTrainingRunRequest = z.infer<typeof CreateTrainingRunRequest>;

export const TrainingRun = z.object({
  runId: z.string(),
  /** Only ever a real provider id. null until the provider returns one. */
  providerJobId: z.string().nullable(),
  status: TrainingStatus,
  statusReason: z.string().nullable(),
  requestKey: z.uuid(),
  spec: TrainingSpec,
  artifactId: z.string().nullable(),
  /** These three are independent facts. One being true implies nothing about the others. */
  trainingCompleted: z.boolean(),
  runtimeReady: z.boolean(),
  evaluationResult: TrainingEvaluation.nullable(),
  /** Last status the provider actually reported. A failed poll does not change it. */
  lastObservedAt: IsoTimestamp.nullable(),
  pollError: ApiError.nullable(),
  createdAt: IsoTimestamp,
  updatedAt: IsoTimestamp,
});
export type TrainingRun = z.infer<typeof TrainingRun>;

export const TrainingRunList = z.object({ runs: z.array(TrainingRun) });
export type TrainingRunList = z.infer<typeof TrainingRunList>;
