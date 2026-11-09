import { z } from "zod";
import { ConnectionState, IsoTimestamp } from "./common";
import { ApiError } from "./errors";
import { ModelReference } from "./model";

export const ModelArtifact = z.object({
  artifactId: z.string(),
  runId: z.string(),
  /** An adapter only works with this base model. */
  baseModel: ModelReference,
  kind: z.enum(["lora_adapter", "full_weights", "unknown"]),
  providerArtifactId: z.string().nullable(),
  uri: z.string().nullable(),
  /** true only after the file was actually observed, not from a job-success response. */
  existenceVerified: z.boolean(),
  verifiedAt: IsoTimestamp.nullable(),
});
export type ModelArtifact = z.infer<typeof ModelArtifact>;

export const RuntimeStatus = z.object({
  artifactId: z.string(),
  state: z.enum(["not_loaded", "loading", "loaded", "load_failed", "unknown"]),
  /** Time a real generated response was observed. Not a performance claim. */
  responseVerifiedAt: IsoTimestamp.nullable(),
  error: ApiError.nullable(),
  updatedAt: IsoTimestamp,
});
export type RuntimeStatus = z.infer<typeof RuntimeStatus>;

export const InferenceRequest = z.object({
  artifactId: z.string().min(1),
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })).min(1),
});
export type InferenceRequest = z.infer<typeof InferenceRequest>;

export const InferenceResponse = z.object({
  artifactId: z.string(),
  text: z.string(),
  connection: ConnectionState,
  respondedAt: IsoTimestamp,
});
export type InferenceResponse = z.infer<typeof InferenceResponse>;
