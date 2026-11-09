import { z } from "zod";

export const ApiErrorCode = z.enum([
  // Service exists but no real provider path is wired or configured.
  "NOT_CONNECTED",
  "INVALID_REQUEST",
  "NOT_FOUND",
  // expectedVersion mismatch or a duplicate request with a different body.
  "CONFLICT",
  // Provider or model cannot do this operation.
  "UNSUPPORTED",
  // Preconditions missing: model, data, account or cost limit.
  "BLOCKED",
  "PAYLOAD_TOO_LARGE",
  "RATE_LIMITED",
  "PROVIDER_ERROR",
  "PROVIDER_TIMEOUT",
  // A provider call may or may not have taken effect. Never auto-retry a create.
  "STATUS_UNKNOWN",
  "INTERNAL",
  // Client-side only, produced by @/shared/api.
  "ABORTED",
  "NETWORK_ERROR",
  "INVALID_RESPONSE",
]);
export type ApiErrorCode = z.infer<typeof ApiErrorCode>;

/** Never put secret values in any field. `requiredConfig` holds names only. */
export const ApiError = z.object({
  code: ApiErrorCode,
  message: z.string(),
  retryable: z.boolean(),
  requiredConfig: z.array(z.string()),
});
export type ApiError = z.infer<typeof ApiError>;

export type ServiceResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

export function ok<T>(data: T): ServiceResult<T> {
  return { ok: true, data };
}

export function fail(
  code: ApiErrorCode,
  message: string,
  options: { retryable?: boolean; requiredConfig?: string[] } = {},
): { ok: false; error: ApiError } {
  return {
    ok: false,
    error: {
      code,
      message,
      retryable: options.retryable ?? false,
      requiredConfig: options.requiredConfig ?? [],
    },
  };
}

export function notConnected(feature: string, requiredConfig: string[] = []) {
  return fail("NOT_CONNECTED", `${feature}이(가) 아직 연결되지 않았습니다.`, { requiredConfig });
}

/** Passed to every server service by the route layer. */
export interface RequestContext {
  /** Anonymous per-browser id. Scope all stored user data by it. */
  ownerId: string;
  signal: AbortSignal;
}
