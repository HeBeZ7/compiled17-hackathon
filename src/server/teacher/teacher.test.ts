import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AgentProfile,
  BenchmarkScore,
  CatalogEntry,
  LlmChatRequest,
  ModelCapabilities,
  ModelReference,
  ServiceResult,
  TeacherRequest,
} from "@/shared/contracts";
import { notConnected, ok } from "@/shared/contracts";

const completeChat = vi.fn<(input: LlmChatRequest) => Promise<ServiceResult<unknown>>>();
const lookupCatalogEntry = vi.fn<(input: { modelId: string }) => Promise<ServiceResult<CatalogEntry>>>();
const getCurrentAgent = vi.fn<() => Promise<ServiceResult<{ agent: AgentProfile | null }>>>();

vi.mock("@/server/llm", () => ({ completeChat: (input: LlmChatRequest) => completeChat(input) }));
vi.mock("@/server/catalog", () => ({
  lookupCatalogEntry: (input: { modelId: string }) => lookupCatalogEntry(input),
}));
vi.mock("@/server/store", () => ({ getCurrentAgent: () => getCurrentAgent() }));

const { askTeacher, askTeacherWith } = await import("./index");

const AGENT_ID = "11111111-1111-4111-8111-111111111111";
const REQUEST_ID = "22222222-2222-4222-8222-222222222222";
const NOW = "2026-11-09T00:00:00.000Z";
const SOURCE = "https://example.com/source";

function capabilities(training: ModelCapabilities["training"]["support"] = "unknown"): ModelCapabilities {
  const unknown = { support: "unknown" as const, evidence: null };
  return {
    listed: unknown,
    accessible: unknown,
    filesPreparable: unknown,
    inference: unknown,
    accountVerified: unknown,
    training: {
      support: training,
      evidence: training === "unknown" ? null : { level: "DOC_REVIEWED", sourceUrl: SOURCE, checkedAt: NOW, note: "Official docs" },
    },
  };
}

function model(modelId: string, training: ModelCapabilities["training"]["support"] = "unknown"): ModelReference {
  return { source: "hf", publisher: "acme", modelId, revision: "abc", licenseRef: null, capabilities: capabilities(training) };
}

function score(overrides: Partial<BenchmarkScore> = {}): BenchmarkScore {
  return {
    benchmark: "b1",
    task: "Summarization",
    dataset: "d1",
    conditions: "c1",
    score: 0.8,
    unit: "acc",
    sourceUrl: SOURCE,
    checkedAt: NOW,
    ...overrides,
  };
}

function entry(ref: ModelReference, benchmarks: BenchmarkScore[]): CatalogEntry {
  return { ref, displayName: ref.modelId, tags: [], benchmarks };
}

const student = model("acme/student");

function profile(selectedModel: ModelReference | null = student, version = 3): AgentProfile {
  return { agentId: AGENT_ID, name: "Choco", selectedModel, avatar: null, version, createdAt: NOW, updatedAt: NOW };
}

function request(overrides: Partial<TeacherRequest> = {}): TeacherRequest {
  return {
    requestId: REQUEST_ID,
    agentId: AGENT_ID,
    profileVersion: 3,
    studentModel: student,
    messages: [{ role: "user", content: "I want to teach it to summarize meeting notes", at: NOW }],
    userGoal: "Meeting note summaries",
    ...overrides,
  };
}

function llmReturns(text: string) {
  completeChat.mockResolvedValue(ok({ text, provider: "p", modelId: "teacher-1", connection: "connected" }));
}

const ctx = { ownerId: "o", signal: new AbortController().signal };

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentAgent.mockResolvedValue(ok({ agent: profile() }));
  lookupCatalogEntry.mockResolvedValue(notConnected("Model catalog"));
});

describe("askTeacher", () => {
  it("puts the stored student model and the goal in context and keeps the teacher model separate", async () => {
    llmReturns(JSON.stringify({ reply: "Shall we prepare a summarizing lesson?", recommendations: [] }));
    const result = await askTeacher(request(), ctx);

    const llmInput = completeChat.mock.calls[0][0];
    expect(llmInput.system).toContain("acme/student");
    expect(llmInput.system).toContain("Meeting note summaries");
    expect(llmInput.system).toContain("a different model from the student model");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.replySource).toBe("llm");
    expect(result.data.teacherModel).toEqual({ provider: "p", modelId: "teacher-1" });
    expect(result.data.studentModel?.modelId).toBe("acme/student");
    expect(result.data.requestId).toBe(REQUEST_ID);
  });

  it("refuses a stale profile version without calling the model", async () => {
    getCurrentAgent.mockResolvedValue(ok({ agent: profile(student, 4) }));
    const result = await askTeacher(request(), ctx);
    expect(result).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    expect(completeChat).not.toHaveBeenCalled();
  });

  it("refuses a request naming a different student model than the stored one", async () => {
    const result = await askTeacher(request({ studentModel: model("acme/other") }), ctx);
    expect(result).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    expect(completeChat).not.toHaveBeenCalled();
  });

  it("passes NOT_CONNECTED through instead of inventing a reply", async () => {
    completeChat.mockResolvedValue(notConnected("Teacher model"));
    expect(await askTeacher(request(), ctx)).toMatchObject({ ok: false, error: { code: "NOT_CONNECTED" } });
  });

  it("uses an injected gateway in place of the default one", async () => {
    const injected = vi.fn(async () =>
      ok({ text: "Test double reply", provider: "test", modelId: "double", connection: "test_double" as const }),
    );
    const result = await askTeacherWith({ completeChat: injected }, request(), ctx);
    expect(injected).toHaveBeenCalledTimes(1);
    expect(completeChat).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: true, data: { connection: "test_double" } });
  });

  it("drops a leading teacher turn and maps roles for the gateway", async () => {
    llmReturns("Plain text");
    await askTeacher(
      request({
        messages: [
          { role: "teacher", content: "Hello", at: NOW },
          { role: "user", content: "Question 1", at: NOW },
          { role: "teacher", content: "Answer", at: NOW },
          { role: "user", content: "Question 2", at: NOW },
        ],
      }),
      ctx,
    );
    expect(completeChat.mock.calls[0][0].messages.map((message) => message.role)).toEqual(["user", "assistant", "user"]);
  });

  it("keeps a non-JSON answer as the reply, with no recommendations", async () => {
    llmReturns("A reply that ignores the format");
    const result = await askTeacher(request(), ctx);
    expect(result).toMatchObject({ ok: true, data: { reply: "A reply that ignores the format", recommendations: [] } });
  });
});

describe("recommendation grounding", () => {
  it("drops citations the server never offered and labels the result a proposal", async () => {
    llmReturns(
      JSON.stringify({
        reply: "r",
        recommendations: [{ kind: "training_direction", summary: "s", evidenceRefs: ["E99"], limitations: null }],
      }),
    );
    const result = await askTeacher(request(), ctx);
    if (!result.ok) throw new Error(result.error.code);
    expect(result.data.recommendations[0].evidence).toHaveLength(1);
    expect(result.data.recommendations[0].evidence[0].level).toBe("ASSISTANT_PROPOSED");
    expect(result.data.recommendations[0].evidence[0].sourceUrl).toBeNull();
  });

  it("resolves a real citation from the server's own evidence", async () => {
    getCurrentAgent.mockResolvedValue(ok({ agent: profile(model("acme/student", "yes")) }));
    llmReturns(
      JSON.stringify({ reply: "r", recommendations: [{ kind: "keep_model", summary: "s", evidenceRefs: ["E1"] }] }),
    );
    const result = await askTeacher(request({ studentModel: model("acme/student", "yes") }), ctx);
    if (!result.ok) throw new Error(result.error.code);
    expect(result.data.recommendations[0].evidence[0]).toMatchObject({ level: "DOC_REVIEWED", sourceUrl: SOURCE });
  });

  const suggestAlternative = () =>
    llmReturns(
      JSON.stringify({
        reply: "r",
        recommendations: [
          {
            kind: "consider_alternative",
            summary: "It is better",
            alternativeModel: { source: "hf", modelId: "acme/alt" },
          },
        ],
      }),
    );

  it("excludes an alternative the catalog cannot confirm", async () => {
    suggestAlternative();
    const result = await askTeacher(request(), ctx);
    if (!result.ok) throw new Error(result.error.code);
    expect(result.data.recommendations).toHaveLength(1);
    expect(result.data.recommendations[0].kind).toBe("need_more_info");
    expect(result.data.recommendations[0].alternativeModel).toBeNull();
  });

  it("excludes an alternative whose scores have no task, dataset or source", async () => {
    suggestAlternative();
    lookupCatalogEntry.mockImplementation(async ({ modelId }) =>
      modelId === "acme/alt" ? ok(entry(model("acme/alt"), [score({ sourceUrl: null }), score({ score: null })])) : notConnected("c"),
    );
    const result = await askTeacher(request(), ctx);
    if (!result.ok) throw new Error(result.error.code);
    expect(result.data.recommendations[0].kind).toBe("need_more_info");
  });

  it("keeps a backed alternative but states the limit when conditions differ", async () => {
    suggestAlternative();
    lookupCatalogEntry.mockImplementation(async ({ modelId }) =>
      modelId === "acme/alt"
        ? ok(entry(model("acme/alt"), [score({ conditions: "c2" })]))
        : ok(entry(student, [score({ conditions: "c1" })])),
    );
    const result = await askTeacher(request(), ctx);
    if (!result.ok) throw new Error(result.error.code);
    const [item] = result.data.recommendations;
    expect(item.kind).toBe("consider_alternative");
    expect(item.alternativeModel?.modelId).toBe("acme/alt");
    expect(item.evidence[0].sourceUrl).toBe(SOURCE);
    expect(item.limitations).toContain("cannot be compared directly");
  });

  it("states no comparison limit when both models share the same benchmark conditions", async () => {
    suggestAlternative();
    lookupCatalogEntry.mockImplementation(async ({ modelId }) =>
      ok(entry(modelId === "acme/alt" ? model("acme/alt") : student, [score()])),
    );
    const result = await askTeacher(request(), ctx);
    if (!result.ok) throw new Error(result.error.code);
    expect(result.data.recommendations[0].limitations).toBeNull();
  });

  it("ignores an alternative attached to a non-alternative kind", async () => {
    llmReturns(
      JSON.stringify({
        reply: "r",
        recommendations: [
          { kind: "keep_model", summary: "s", alternativeModel: { source: "hf", modelId: "acme/alt" } },
        ],
      }),
    );
    const result = await askTeacher(request(), ctx);
    if (!result.ok) throw new Error(result.error.code);
    expect(result.data.recommendations[0].alternativeModel).toBeNull();
  });
});
