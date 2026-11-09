import "server-only";
import { NEBIUS_KEY_NAME, hasNebiusKey, nebiusChat, nebiusListModels, type NebiusModelEntry, type NebiusResult } from "@/server/llm/nebius";
import { COLLECTIONS, type Store } from "@/server/store/store";
import {
  fail,
  notConnected,
  ok,
  type InferenceRequest,
  type InferenceResponse,
  type ModelArtifact,
  type RequestContext,
  type RuntimeStatus,
  type ServiceResult,
} from "@/shared/contracts";

export interface ArtifactRecord {
  artifact: ModelArtifact;
  runtime: RuntimeStatus;
  fileIds: string[];
}

export interface RuntimeProvider {
  requiredConfig: string[];
  isConfigured(): boolean;
  listModels(signal: AbortSignal): Promise<NebiusResult<NebiusModelEntry[]>>;
  chat(model: string, messages: InferenceRequest["messages"], maxTokens: number, signal: AbortSignal): Promise<NebiusResult<string>>;
}

export const nebiusRuntimeProvider: RuntimeProvider = {
  requiredConfig: [NEBIUS_KEY_NAME],
  isConfigured: hasNebiusKey,
  listModels: nebiusListModels,
  chat: (model, messages, maxTokens, signal) => nebiusChat({ model, messages, maxTokens, signal }),
};

const PROBE_MESSAGES: InferenceRequest["messages"] = [{ role: "user", content: "Hello" }];
const PROBE_MAX_TOKENS = 16;
const INFERENCE_MAX_TOKENS = 1024;

export interface ArtifactDeps {
  store: Store;
  runtime: RuntimeProvider;
}

export function createArtifactService({ store, runtime }: ArtifactDeps) {
  const read = (artifactId: string, ctx: RequestContext) =>
    store.get<ArtifactRecord>(COLLECTIONS.artifacts, ctx.ownerId, artifactId)?.value ?? null;

  function saveRuntime(record: ArtifactRecord, status: Omit<RuntimeStatus, "artifactId" | "updatedAt">, ctx: RequestContext): RuntimeStatus {
    const next: RuntimeStatus = { ...status, artifactId: record.artifact.artifactId, updatedAt: new Date().toISOString() };
    store.put(COLLECTIONS.artifacts, ctx.ownerId, record.artifact.artifactId, { ...record, runtime: next });
    return next;
  }

  const missing = () => fail("NOT_FOUND", "Training artifact not found");

  return {
    async getArtifact(artifactId: string, ctx: RequestContext): Promise<ServiceResult<ModelArtifact>> {
      const record = read(artifactId, ctx);
      return record ? ok(record.artifact) : missing();
    },

    async getRuntimeStatus(artifactId: string, ctx: RequestContext): Promise<ServiceResult<RuntimeStatus>> {
      const record = read(artifactId, ctx);
      return record ? ok(record.runtime) : missing();
    },

    /**
     * Nebius documents no public API that serves a fine-tuned checkpoint (the
     * dedicated-endpoint route is beta, on request). So this only uses a model
     * name the provider itself lists, and never guesses an inference name.
     */
    async loadArtifactRuntime(artifactId: string, ctx: RequestContext): Promise<ServiceResult<RuntimeStatus>> {
      const record = read(artifactId, ctx);
      if (!record) return missing();
      if (!runtime.isConfigured()) return notConnected("Result model runtime", runtime.requiredConfig);
      if (!record.artifact.existenceVerified) return fail("BLOCKED", "Artifact existence is not verified");

      const none = { responseVerifiedAt: null };
      const modelName = record.artifact.providerArtifactId;
      const models = await runtime.listModels(ctx.signal);
      if (!models.ok) return ok(saveRuntime(record, { ...none, state: "unknown", error: models.error }, ctx));

      const listed = modelName === null ? undefined : models.data.find((model) => model.id === modelName);
      if (!listed || modelName === null) {
        return ok(
          saveRuntime(
            record,
            { ...none, state: "not_loaded", error: notConnected("Result model runtime").error },
            ctx,
          ),
        );
      }
      if (listed.status === "validating") return ok(saveRuntime(record, { ...none, state: "loading", error: null }, ctx));
      if (listed.status === "error" || listed.status === "deleted") {
        return ok(saveRuntime(record, { ...none, state: "load_failed", error: fail("PROVIDER_ERROR", "The provider reported this model cannot be used").error }, ctx));
      }

      const probe = await runtime.chat(modelName, PROBE_MESSAGES, PROBE_MAX_TOKENS, ctx.signal);
      if (!probe.ok) return ok(saveRuntime(record, { ...none, state: "load_failed", error: probe.error }, ctx));
      return ok(saveRuntime(record, { state: "loaded", responseVerifiedAt: new Date().toISOString(), error: null }, ctx));
    },

    async runInference(input: InferenceRequest, ctx: RequestContext): Promise<ServiceResult<InferenceResponse>> {
      const record = read(input.artifactId, ctx);
      if (!record) return missing();
      if (!runtime.isConfigured()) return notConnected("Result model response", runtime.requiredConfig);
      if (record.runtime.state !== "loaded" || record.artifact.providerArtifactId === null) {
        return fail("BLOCKED", "The result model is not loaded yet");
      }

      const reply = await runtime.chat(record.artifact.providerArtifactId, input.messages, INFERENCE_MAX_TOKENS, ctx.signal);
      if (!reply.ok) return { ok: false, error: reply.error };
      return ok({ artifactId: input.artifactId, text: reply.data, connection: "connected", respondedAt: new Date().toISOString() });
    },
  };
}
