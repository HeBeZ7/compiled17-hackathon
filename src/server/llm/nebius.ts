import "server-only";
import { z } from "zod";
import { fail, type ApiError } from "@/shared/contracts";

/** Evidence: docs/integrations/nebius.md. The host is fixed; callers supply only paths. */
export const NEBIUS_API_BASE = "https://api.tokenfactory.nebius.com/v1";
export const NEBIUS_PROVIDER_ID = "nebius";
export const NEBIUS_KEY_NAME = "NEBIUS_API_KEY";

export function hasNebiusKey(): boolean {
  return Boolean(process.env[NEBIUS_KEY_NAME]);
}

/**
 * `rejected`: the provider refused the call, so it had no effect.
 * `indeterminate`: it may have taken effect (timeout, network, 5xx, unreadable 200).
 * A create that ends indeterminate must never be retried automatically.
 */
export type NebiusOutcome = "rejected" | "indeterminate";

export type NebiusResult<T> = { ok: true; data: T } | { ok: false; error: ApiError; outcome: NebiusOutcome };

export interface NebiusRequest {
  method?: "GET" | "POST";
  json?: unknown;
  form?: FormData;
  timeoutMs?: number;
  /** Leave unset on creates and cancels: a closed browser tab must not abandon them. */
  signal?: AbortSignal;
}

const DEFAULT_TIMEOUT_MS = 60_000;

function rejected(error: ApiError): NebiusResult<never> {
  return { ok: false, error, outcome: "rejected" };
}

function indeterminate(error: ApiError): NebiusResult<never> {
  return { ok: false, error, outcome: "indeterminate" };
}

function failureFor(status: number): NebiusResult<never> {
  if (status === 401 || status === 403) {
    return rejected(
      fail("NOT_CONNECTED", "Nebius rejected the API key or permission", { requiredConfig: [NEBIUS_KEY_NAME] }).error,
    );
  }
  if (status === 402) return rejected(fail("BLOCKED", "Check your Nebius account balance or billing status").error);
  if (status === 404) return rejected(fail("NOT_FOUND", "Nebius could not find the requested target").error);
  if (status === 429) return rejected(fail("RATE_LIMITED", "Nebius request limit exceeded", { retryable: true }).error);
  if (status >= 500) {
    return indeterminate(fail("PROVIDER_ERROR", `Nebius server error (HTTP ${status})`, { retryable: true }).error);
  }
  return rejected(fail("PROVIDER_ERROR", `Nebius rejected the request (HTTP ${status})`).error);
}

/** Provider response bodies are never copied into errors: they can echo user data. */
export async function nebiusRequest<S extends z.ZodType>(
  path: string,
  schema: S,
  options: NebiusRequest = {},
): Promise<NebiusResult<z.output<S>>> {
  const key = process.env[NEBIUS_KEY_NAME];
  if (!key) {
    return rejected(fail("NOT_CONNECTED", "Nebius connection details are missing", { requiredConfig: [NEBIUS_KEY_NAME] }).error);
  }

  const timeout = AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  const headers: Record<string, string> = { Authorization: `Bearer ${key}`, Accept: "application/json" };
  if (options.json !== undefined) headers["Content-Type"] = "application/json";

  let response: Response;
  try {
    response = await fetch(`${NEBIUS_API_BASE}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.form ?? (options.json === undefined ? undefined : JSON.stringify(options.json)),
      signal,
      redirect: "error",
      cache: "no-store",
    });
  } catch {
    return timeout.aborted
      ? indeterminate(fail("PROVIDER_TIMEOUT", "Nebius response timed out", { retryable: true }).error)
      : indeterminate(fail("PROVIDER_ERROR", "Could not connect to Nebius", { retryable: true }).error);
  }

  if (!response.ok) return failureFor(response.status);

  try {
    const parsed = schema.safeParse(await response.json());
    if (parsed.success) return { ok: true, data: parsed.data };
  } catch {
    // Unreadable body: handled below as an unexpected response.
  }
  return indeterminate(fail("PROVIDER_ERROR", "Could not parse the Nebius response", { retryable: true }).error);
}

const ChatCompletion = z.object({
  choices: z
    .array(z.object({ message: z.object({ content: z.string().nullable().optional() }) }))
    .min(1),
});

export interface NebiusChatInput {
  model: string;
  system?: string | null;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  maxTokens: number;
  signal?: AbortSignal;
}

export async function nebiusChat(input: NebiusChatInput): Promise<NebiusResult<string>> {
  const messages = input.system ? [{ role: "system", content: input.system }, ...input.messages] : input.messages;
  const result = await nebiusRequest("/chat/completions", ChatCompletion, {
    method: "POST",
    json: { model: input.model, messages, max_tokens: input.maxTokens },
    signal: input.signal,
  });
  if (!result.ok) return result;

  const text = result.data.choices[0].message.content;
  if (!text) return indeterminate(fail("PROVIDER_ERROR", "Nebius returned an empty reply", { retryable: true }).error);
  return { ok: true, data: text };
}

const ModelList = z.object({
  data: z.array(z.object({ id: z.string(), status: z.string().nullable().optional() })),
});

export type NebiusModelEntry = z.output<typeof ModelList>["data"][number];

export async function nebiusListModels(signal?: AbortSignal): Promise<NebiusResult<NebiusModelEntry[]>> {
  const result = await nebiusRequest("/models", ModelList, { signal });
  return result.ok ? { ok: true, data: result.data.data } : result;
}
