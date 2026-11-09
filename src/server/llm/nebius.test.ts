import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RequestContext } from "@/shared/contracts";
import { completeChat } from "./index";

const SECRET = "test-secret-value";
const ctx: RequestContext = { ownerId: "o", signal: new AbortController().signal };
const request = { system: "s", messages: [{ role: "user" as const, content: "hi" }], maxOutputTokens: 10 };

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  vi.stubEnv("NEBIUS_API_KEY", SECRET);
  vi.stubEnv("NEBIUS_TEACHER_MODEL", "org/teacher");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("completeChat", () => {
  it("reports NOT_CONNECTED by key name and makes no call when unconfigured", async () => {
    vi.stubEnv("NEBIUS_API_KEY", "");
    const result = await completeChat(request, ctx);
    expect(!result.ok && result.error).toMatchObject({ code: "NOT_CONNECTED", requiredConfig: ["NEBIUS_API_KEY", "NEBIUS_TEACHER_MODEL"] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requires a configured teacher model rather than picking one", async () => {
    vi.stubEnv("NEBIUS_TEACHER_MODEL", "");
    const result = await completeChat(request, ctx);
    expect(!result.ok && result.error.code).toBe("NOT_CONNECTED");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the documented request and returns the provider's text", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ choices: [{ message: { content: "answer" } }] }));
    const result = await completeChat(request, ctx);
    expect(result).toEqual({ ok: true, data: { text: "answer", provider: "nebius", modelId: "org/teacher", connection: "connected" } });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.tokenfactory.nebius.com/v1/chat/completions");
    expect(init.headers.Authorization).toBe(`Bearer ${SECRET}`);
    expect(JSON.parse(init.body)).toEqual({
      model: "org/teacher",
      messages: [{ role: "system", content: "s" }, { role: "user", content: "hi" }],
      max_tokens: 10,
    });
  });

  it.each([
    [401, "NOT_CONNECTED"],
    [402, "BLOCKED"],
    [404, "NOT_FOUND"],
    [429, "RATE_LIMITED"],
    [503, "PROVIDER_ERROR"],
  ])("maps HTTP %i to %s without leaking the key or body", async (status, code) => {
    fetchMock.mockResolvedValue(jsonResponse({ detail: "PROVIDER-BODY" }, status));
    const result = await completeChat(request, ctx);
    expect(!result.ok && result.error.code).toBe(code);
    expect(JSON.stringify(result)).not.toContain(SECRET);
    expect(JSON.stringify(result)).not.toContain("PROVIDER-BODY");
  });

  it("treats an empty completion as an error, not an answer", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ choices: [{ message: { content: "" } }] }));
    const result = await completeChat(request, ctx);
    expect(!result.ok && result.error.code).toBe("PROVIDER_ERROR");
  });
});
