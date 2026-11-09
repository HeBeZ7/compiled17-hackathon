import "server-only";
import { notConnected, type ModelArtifact, type RequestContext, type RuntimeStatus, type ServiceResult } from "@/shared/contracts";

// E owns this module.

export async function getArtifact(_artifactId: string, _ctx: RequestContext): Promise<ServiceResult<ModelArtifact>> {
  return notConnected("학습 결과물");
}

export async function getRuntimeStatus(_artifactId: string, _ctx: RequestContext): Promise<ServiceResult<RuntimeStatus>> {
  return notConnected("결과 모델 실행");
}

export async function loadArtifactRuntime(_artifactId: string, _ctx: RequestContext): Promise<ServiceResult<RuntimeStatus>> {
  return notConnected("결과 모델 실행");
}
