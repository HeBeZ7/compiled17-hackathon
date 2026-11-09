import "server-only";
import { notConnected, type LlmChatRequest, type LlmChatResponse, type RequestContext, type ServiceResult } from "@/shared/contracts";

// E owns this gateway. D's teacher service calls it; it has no HTTP route.

export async function completeChat(_input: LlmChatRequest, _ctx: RequestContext): Promise<ServiceResult<LlmChatResponse>> {
  return notConnected("선생님 모델");
}
