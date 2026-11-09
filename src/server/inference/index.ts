import "server-only";
import { notConnected, type InferenceRequest, type InferenceResponse, type RequestContext, type ServiceResult } from "@/shared/contracts";

// E owns this module.

export async function runInference(_input: InferenceRequest, _ctx: RequestContext): Promise<ServiceResult<InferenceResponse>> {
  return notConnected("결과 모델 응답");
}
