import { z } from "zod";
import { IsoTimestamp } from "./common";
import { ModelReference } from "./model";

export const AvatarInputKind = z.enum(["drawing", "photo"]);
export type AvatarInputKind = z.infer<typeof AvatarInputKind>;

export const AvatarVariant = z.enum(["original", "render"]);
export type AvatarVariant = z.infer<typeof AvatarVariant>;

/** Accepted raster types. The server checks magic bytes, not the file name. */
export const AVATAR_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export const AVATAR_MAX_ORIGINAL_BYTES = 8 * 1024 * 1024;
export const AVATAR_MAX_RENDER_BYTES = 2 * 1024 * 1024;

export const AvatarAsset = z.object({
  assetId: z.uuid(),
  inputKind: AvatarInputKind,
  /** Same-origin URLs served by /api/avatars/:assetId/:variant. */
  originalUrl: z.string(),
  renderUrl: z.string(),
  createdAt: IsoTimestamp,
});
export type AvatarAsset = z.infer<typeof AvatarAsset>;

export const AgentProfile = z.object({
  agentId: z.uuid(),
  name: z.string().min(1).max(40),
  selectedModel: ModelReference.nullable(),
  avatar: AvatarAsset.nullable(),
  /** Increments on every save. Compare to drop late responses for an older selection. */
  version: z.number().int().min(1),
  createdAt: IsoTimestamp,
  updatedAt: IsoTimestamp,
});
export type AgentProfile = z.infer<typeof AgentProfile>;

export const CurrentAgentResponse = z.object({ agent: AgentProfile.nullable() });
export type CurrentAgentResponse = z.infer<typeof CurrentAgentResponse>;

export const SaveAgentRequest = z.object({
  name: z.string().trim().min(1).max(40),
  selectedModel: ModelReference.nullable(),
  avatarAssetId: z.uuid().nullable(),
  /** Version the client edited. null only when creating the first profile. */
  expectedVersion: z.number().int().min(1).nullable(),
});
export type SaveAgentRequest = z.infer<typeof SaveAgentRequest>;
