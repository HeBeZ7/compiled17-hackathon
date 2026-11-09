import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { lookupHubModel, searchHub } from "./huggingface";

const signal = new AbortController().signal;
const SHA = "c1899de289a04d12100db370d81485cdf75e47ca";
const fetchMock = vi.fn();

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), { status: 200, ...init });
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});

afterEach(() => vi.unstubAllGlobals());

describe("searchHub", () => {
  it("keeps real identifiers and separates listing from training support", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        [
          { id: "Qwen/Qwen3-14B", sha: SHA, gated: false, private: false, tags: ["license:apache-2.0"], cardData: { license: "apache-2.0" } },
          { id: "meta-llama/Llama-3.1-8B-Instruct", sha: SHA, gated: "manual", private: false, tags: [] },
          { id: "someone/untrained", gated: false, private: false, tags: [] },
        ],
        { headers: { link: '<https://huggingface.co/api/models?limit=3&cursor=abc123>; rel="next"' } },
      ),
    );

    const result = await searchHub({ query: "q", limit: 3, signal });
    if (!result.ok) throw new Error(result.error.message);
    const [qwen, llama, other] = result.data.items;

    expect(result.data.nextCursor).toBe("abc123");
    expect(qwen.ref).toMatchObject({ modelId: "Qwen/Qwen3-14B", publisher: "Qwen", revision: SHA, licenseRef: "apache-2.0" });
    expect(qwen.ref.capabilities.listed.support).toBe("yes");
    expect(qwen.ref.capabilities.training).toMatchObject({ support: "yes", evidence: { level: "DOC_REVIEWED" } });
    expect(qwen.ref.capabilities.accountVerified.support).toBe("unknown");
    expect(qwen.benchmarks).toEqual([]);

    expect(llama.ref.capabilities.accessible.support).toBe("unknown");
    expect(other.ref.revision).toBeNull();
    expect(other.ref.capabilities.training.support).toBe("unknown");
  });

  it("passes the cursor through and has no next page without a Link header", async () => {
    fetchMock.mockResolvedValue(jsonResponse([]));
    const result = await searchHub({ query: "", cursor: "next-page", limit: 5, signal });
    expect(result.ok && result.data.nextCursor).toBeNull();
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.origin).toBe("https://huggingface.co");
    expect(url.searchParams.get("cursor")).toBe("next-page");
  });

  it("reports rate limits and malformed responses as errors, not empty results", async () => {
    fetchMock.mockResolvedValueOnce(new Response("", { status: 429 }));
    const limited = await searchHub({ query: "", limit: 1, signal });
    expect(!limited.ok && limited.error).toMatchObject({ code: "RATE_LIMITED", retryable: true });

    fetchMock.mockResolvedValueOnce(jsonResponse({ unexpected: true }));
    const malformed = await searchHub({ query: "", limit: 1, signal });
    expect(!malformed.ok && malformed.error.code).toBe("PROVIDER_ERROR");
  });
});

describe("lookupHubModel", () => {
  it("claims files preparable only for an open model with weights observed", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: "a/b", sha: SHA, gated: false, private: false, siblings: [{ rfilename: "model.safetensors" }] }));
    const open = await lookupHubModel("a/b", undefined, signal);
    expect(open.ok && open.data.ref.capabilities.filesPreparable.support).toBe("yes");

    fetchMock.mockResolvedValue(jsonResponse({ id: "a/b", sha: SHA, gated: "auto", private: false, siblings: [{ rfilename: "model.safetensors" }] }));
    const gated = await lookupHubModel("a/b", undefined, signal);
    expect(gated.ok && gated.data.ref.capabilities.filesPreparable.support).toBe("unknown");
  });

  it("rejects identifiers that could reach another path, without fetching", async () => {
    for (const id of ["../../etc/passwd", "a/b/c", "https://evil.example/x"]) {
      const result = await lookupHubModel(id, undefined, signal);
      expect(!result.ok && result.error.code).toBe("INVALID_REQUEST");
    }
    const badRevision = await lookupHubModel("a/b", "main/../x", signal);
    expect(!badRevision.ok && badRevision.error.code).toBe("INVALID_REQUEST");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps the Hub's 401 for a missing repo to NOT_FOUND", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 401 }));
    const result = await lookupHubModel("nope/missing", undefined, signal);
    expect(!result.ok && result.error.code).toBe("NOT_FOUND");
  });
});
