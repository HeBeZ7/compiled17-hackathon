import "server-only";
import { operatorPriceProvider } from "@/server/pricing/service";
import { getStore } from "@/server/store";
import type {
  CreateTrainingRunRequest,
  RequestContext,
  ServiceResult,
  TrainingDataset,
  TrainingRun,
  TrainingRunList,
  TrainingSpec,
  TrainingValidation,
} from "@/shared/contracts";
import { nebiusTrainingProvider } from "./provider";
import { createTrainingService, readMaxApprovedUsd } from "./service";

// E owns this module. The factory below is the injection point for tests.

export { TRAINING_MAX_USD_ENV, createTrainingService, readMaxApprovedUsd } from "./service";
export type { TrainingDeps } from "./service";
export { nebiusTrainingProvider } from "./provider";
export type { TrainingProvider } from "./provider";

function service() {
  return createTrainingService({
    store: getStore(),
    provider: nebiusTrainingProvider,
    prices: operatorPriceProvider,
    maxApprovedUsd: readMaxApprovedUsd,
  });
}

export async function uploadDataset(form: FormData, ctx: RequestContext): Promise<ServiceResult<TrainingDataset>> {
  return service().uploadDataset(form, ctx);
}

export async function validateTraining(spec: TrainingSpec, ctx: RequestContext): Promise<ServiceResult<TrainingValidation>> {
  return service().validateTraining(spec, ctx);
}

export async function createTrainingRun(input: CreateTrainingRunRequest, ctx: RequestContext): Promise<ServiceResult<TrainingRun>> {
  return service().createTrainingRun(input, ctx);
}

export async function listTrainingRuns(ctx: RequestContext): Promise<ServiceResult<TrainingRunList>> {
  return service().listTrainingRuns(ctx);
}

export async function getTrainingRun(runId: string, ctx: RequestContext): Promise<ServiceResult<TrainingRun>> {
  return service().getTrainingRun(runId, ctx);
}

export async function cancelTrainingRun(runId: string, ctx: RequestContext): Promise<ServiceResult<TrainingRun>> {
  return service().cancelTrainingRun(runId, ctx);
}
