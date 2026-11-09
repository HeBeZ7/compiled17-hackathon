import "server-only";
import { notConnected, ok, type LlmChatRequest, type LlmChatResponse, type RequestContext, type ServiceResult } from "@/shared/contracts";
import { NEBIUS_KEY_NAME, NEBIUS_PROVIDER_ID, hasNebiusKey, nebiusChat } from "./nebius";

// E owns this gateway. D's teacher service calls it; it has no HTTP route.

/** Deliberately not defaulted: Nebius retires serverless models without rerouting. */
export const TEACHER_MODEL_ENV = "NEBIUS_TEACHER_MODEL";
const DEFAULT_MAX_OUTPUT_TOKENS = 1024;

export async function completeChat(input: LlmChatRequest, ctx: RequestContext): Promise<ServiceResult<LlmChatResponse>> {
  const modelId = process.env[TEACHER_MODEL_ENV];
  if (!hasNebiusKey() || !modelId) return notConnected("선생님 모델", [NEBIUS_KEY_NAME, TEACHER_MODEL_ENV]);

  const result = await nebiusChat({
    model: modelId,
    system: input.system,
    messages: input.messages,
    maxTokens: input.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
    signal: ctx.signal,
  });
  if (!result.ok) return { ok: false, error: result.error };
  return ok({ text: result.data, provider: NEBIUS_PROVIDER_ID, modelId, connection: "connected" });
}
