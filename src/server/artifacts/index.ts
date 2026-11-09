import "server-only";
import { getStore } from "@/server/store";
import type { ModelArtifact, RequestContext, RuntimeStatus, ServiceResult } from "@/shared/contracts";
import { createArtifactService, nebiusRuntimeProvider } from "./service";

// E owns this module.

export { createArtifactService, nebiusRuntimeProvider } from "./service";
export type { ArtifactDeps, ArtifactRecord, RuntimeProvider } from "./service";

function service() {
  return createArtifactService({ store: getStore(), runtime: nebiusRuntimeProvider });
}

export async function getArtifact(artifactId: string, ctx: RequestContext): Promise<ServiceResult<ModelArtifact>> {
  return service().getArtifact(artifactId, ctx);
}

export async function getRuntimeStatus(artifactId: string, ctx: RequestContext): Promise<ServiceResult<RuntimeStatus>> {
  return service().getRuntimeStatus(artifactId, ctx);
}

export async function loadArtifactRuntime(artifactId: string, ctx: RequestContext): Promise<ServiceResult<RuntimeStatus>> {
  return service().loadArtifactRuntime(artifactId, ctx);
}
