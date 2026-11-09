import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveOwnerId } from "@/server/store";
import {
  fail,
  ok,
  type ApiErrorCode,
  type RequestContext,
  type ServiceResult,
} from "@/shared/contracts";

const HTTP_STATUS: Record<ApiErrorCode, number> = {
  INVALID_REQUEST: 400,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED: 422,
  BLOCKED: 422,
  RATE_LIMITED: 429,
  INTERNAL: 500,
  PROVIDER_ERROR: 502,
  STATUS_UNKNOWN: 502,
  NOT_CONNECTED: 503,
  PROVIDER_TIMEOUT: 504,
  ABORTED: 499,
  NETWORK_ERROR: 502,
  INVALID_RESPONSE: 502,
};

export function toResponse<T>(result: ServiceResult<T>): NextResponse {
  return NextResponse.json(result, { status: result.ok ? 200 : HTTP_STATUS[result.error.code] });
}

interface HandlerArgs<P> {
  req: Request;
  ctx: RequestContext;
  params: P;
}

/** Thin route wrapper: resolves the owner, maps results to HTTP, hides internal errors. */
export function handler<P>(fn: (args: HandlerArgs<P>) => Promise<ServiceResult<unknown> | Response>) {
  return async (req: Request, segment: { params: Promise<P> }): Promise<Response> => {
    try {
      const ownerId = await resolveOwnerId();
      const result = await fn({ req, ctx: { ownerId, signal: req.signal }, params: await segment.params });
      return result instanceof Response ? result : toResponse(result);
    } catch (error) {
      console.error(`Unhandled error in ${req.method} ${new URL(req.url).pathname}`, error);
      return toResponse(fail("INTERNAL", "서버에서 문제가 발생했습니다.", { retryable: true }));
    }
  };
}

export async function parseJson<S extends z.ZodType>(req: Request, schema: S): Promise<ServiceResult<z.output<S>>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail("INVALID_REQUEST", "요청 본문이 올바른 JSON이 아닙니다.");
  }
  return validate(schema, body);
}

export function parseQuery<S extends z.ZodType>(req: Request, schema: S): ServiceResult<z.output<S>> {
  return validate(schema, Object.fromEntries(new URL(req.url).searchParams));
}

function validate<S extends z.ZodType>(schema: S, value: unknown): ServiceResult<z.output<S>> {
  const parsed = schema.safeParse(value);
  return parsed.success ? ok(parsed.data) : fail("INVALID_REQUEST", "요청 내용이 약속된 형식과 다릅니다.");
}
