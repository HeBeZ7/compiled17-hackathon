import "server-only";
import {
  notConnected,
  type CreateTrainingRunRequest,
  type RequestContext,
  type ServiceResult,
  type TrainingDataset,
  type TrainingRun,
  type TrainingRunList,
  type TrainingSpec,
  type TrainingValidation,
} from "@/shared/contracts";

// E owns this module. Track requests durably through the store's insertIfAbsent
// with COLLECTIONS.trainingRequests keyed by requestKey, before calling a provider.

export async function uploadDataset(_form: FormData, _ctx: RequestContext): Promise<ServiceResult<TrainingDataset>> {
  return notConnected("학습 자료 저장");
}

export async function validateTraining(_spec: TrainingSpec, _ctx: RequestContext): Promise<ServiceResult<TrainingValidation>> {
  return notConnected("학습 조건 확인");
}

export async function createTrainingRun(_input: CreateTrainingRunRequest, _ctx: RequestContext): Promise<ServiceResult<TrainingRun>> {
  return notConnected("GPU 학습");
}

export async function listTrainingRuns(_ctx: RequestContext): Promise<ServiceResult<TrainingRunList>> {
  return notConnected("GPU 학습");
}

export async function getTrainingRun(_runId: string, _ctx: RequestContext): Promise<ServiceResult<TrainingRun>> {
  return notConnected("GPU 학습");
}

export async function cancelTrainingRun(_runId: string, _ctx: RequestContext): Promise<ServiceResult<TrainingRun>> {
  return notConnected("GPU 학습");
}
