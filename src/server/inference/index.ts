import "server-only";
import { createArtifactService, nebiusRuntimeProvider } from "@/server/artifacts/service";
import { getStore } from "@/server/store";
import type { InferenceRequest, InferenceResponse, RequestContext, ServiceResult } from "@/shared/contracts";

// E owns this module.

export async function runInference(input: InferenceRequest, ctx: RequestContext): Promise<ServiceResult<InferenceResponse>> {
  return createArtifactService({ store: getStore(), runtime: nebiusRuntimeProvider }).runInference(input, ctx);
}
