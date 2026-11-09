import { z } from "zod";
import {
  AgentProfile,
  ApiError,
  AvatarAsset,
  CatalogEntry,
  CatalogPage,
  CurrentAgentResponse,
  InferenceResponse,
  ModelArtifact,
  ModelPreparation,
  PriceQuote,
  RuntimeStatus,
  TeacherResponse,
  TrainingDataset,
  TrainingRun,
  TrainingRunList,
  TrainingValidation,
  fail,
  type CatalogSearchQuery,
  type CreateTrainingRunRequest,
  type InferenceRequest,
  type ModelLookupQuery,
  type ModelPreparationRequest,
  type PriceQuoteRequest,
  type SaveAgentRequest,
  type ServiceResult,
  type TeacherRequest,
  type TrainingSpec,
} from "@/shared/contracts";

/**
 * Typed browser client. Never throws: every failure, including an aborted
 * request, comes back as an ApiError. Responses are validated against the
 * shared contract so drift surfaces as INVALID_RESPONSE instead of bad UI.
 */
async function call<T>(schema: z.ZodType<T>, path: string, init: RequestInit = {}): Promise<ServiceResult<T>> {
  const envelope = z.union([
    z.object({ ok: z.literal(true), data: schema }),
    z.object({ ok: z.literal(false), error: ApiError }),
  ]);
  let body: unknown;
  try {
    const response = await fetch(path, { credentials: "same-origin", ...init });
    body = await response.json();
  } catch (error) {
    if (init.signal?.reason instanceof DOMException && init.signal.reason.name === "TimeoutError") {
      return fail("NETWORK_ERROR", "The server is taking too long to respond", { retryable: true });
    }
    if (init.signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) {
      return fail("ABORTED", "Request canceled");
    }
    if (error instanceof SyntaxError) {
      return fail("INVALID_RESPONSE", "The server response could not be read");
    }
    return fail("NETWORK_ERROR", "Could not reach the server", { retryable: true });
  }
  const parsed = envelope.safeParse(body);
  if (!parsed.success) {
    console.error(`Contract mismatch on ${path}`, z.prettifyError(parsed.error));
    return fail("INVALID_RESPONSE", "The server response did not match the expected format");
  }
  return parsed.data as ServiceResult<T>;
}

function json(method: "POST" | "PUT", body: unknown, signal?: AbortSignal): RequestInit {
  return { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal };
}

function query(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

const id = encodeURIComponent;

export const api = {
  agents: {
    current: (signal?: AbortSignal) => call(CurrentAgentResponse, "/api/agents/current", { signal }),
    save: (input: SaveAgentRequest, signal?: AbortSignal) =>
      call(AgentProfile, "/api/agents/current", json("PUT", input, signal)),
  },
  /** FormData fields: inputKind ("drawing" | "photo"), original (File), render (File). */
  avatars: {
    upload: (form: FormData, signal?: AbortSignal) =>
      call(AvatarAsset, "/api/avatars", { method: "POST", body: form, signal }),
  },
  catalog: {
    search: (input: Partial<CatalogSearchQuery>, signal?: AbortSignal) =>
      call(CatalogPage, `/api/catalog/models${query(input)}`, { signal }),
    lookup: (input: ModelLookupQuery, signal?: AbortSignal) =>
      call(CatalogEntry, `/api/catalog/model${query(input)}`, { signal }),
  },
  preparations: {
    create: (input: ModelPreparationRequest, signal?: AbortSignal) =>
      call(ModelPreparation, "/api/models/preparations", json("POST", input, signal)),
    get: (preparationId: string, signal?: AbortSignal) =>
      call(ModelPreparation, `/api/models/preparations/${id(preparationId)}`, { signal }),
  },
  pricing: {
    quote: (input: PriceQuoteRequest, signal?: AbortSignal) =>
      call(PriceQuote, "/api/pricing/quotes", json("POST", input, signal)),
  },
  teacher: {
    ask: (input: TeacherRequest, signal?: AbortSignal) =>
      call(TeacherResponse, "/api/teacher/messages", json("POST", input, signal)),
  },
  training: {
    /** FormData field: file (File). */
    uploadDataset: (form: FormData, signal?: AbortSignal) =>
      call(TrainingDataset, "/api/training/datasets", { method: "POST", body: form, signal }),
    validate: (spec: TrainingSpec, signal?: AbortSignal) =>
      call(TrainingValidation, "/api/training/validate", json("POST", spec, signal)),
    create: (input: CreateTrainingRunRequest, signal?: AbortSignal) =>
      call(TrainingRun, "/api/training/runs", json("POST", input, signal)),
    list: (signal?: AbortSignal) => call(TrainingRunList, "/api/training/runs", { signal }),
    get: (runId: string, signal?: AbortSignal) => call(TrainingRun, `/api/training/runs/${id(runId)}`, { signal }),
    cancel: (runId: string, signal?: AbortSignal) =>
      call(TrainingRun, `/api/training/runs/${id(runId)}/cancel`, { method: "POST", signal }),
  },
  artifacts: {
    get: (artifactId: string, signal?: AbortSignal) =>
      call(ModelArtifact, `/api/artifacts/${id(artifactId)}`, { signal }),
    runtime: (artifactId: string, signal?: AbortSignal) =>
      call(RuntimeStatus, `/api/artifacts/${id(artifactId)}/runtime`, { signal }),
    load: (artifactId: string, signal?: AbortSignal) =>
      call(RuntimeStatus, `/api/artifacts/${id(artifactId)}/runtime`, { method: "POST", signal }),
  },
  inference: {
    run: (input: InferenceRequest, signal?: AbortSignal) =>
      call(InferenceResponse, "/api/inference", json("POST", input, signal)),
  },
};
