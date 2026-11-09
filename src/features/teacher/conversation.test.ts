import { describe, expect, it } from "vitest";
import { TeacherRequest, type AgentProfile, type ModelReference } from "@/shared/contracts";
import { buildTeacherRequest, contextMessages, isCurrentResponse, modelKey, type ConsultLine } from "./conversation";
import { safeHttpUrl } from "./format";

const AT = "2026-11-09T00:00:00.000Z";
const ID = "11111111-1111-4111-8111-111111111111";
const unknown = { support: "unknown" as const, evidence: null };
const model: ModelReference = {
  source: "hf",
  publisher: null,
  modelId: "acme/m",
  revision: null,
  licenseRef: null,
  capabilities: {
    listed: unknown,
    accessible: unknown,
    filesPreparable: unknown,
    inference: unknown,
    training: unknown,
    accountVerified: unknown,
  },
};
const agent: AgentProfile = {
  agentId: ID,
  name: "Choco",
  selectedModel: model,
  avatar: null,
  version: 2,
  createdAt: AT,
  updatedAt: AT,
};

function line(role: "user" | "teacher", content: string, index = 0): ConsultLine {
  return {
    id: `${role}-${index}`,
    role,
    content,
    at: AT,
    source: role === "user" ? "user" : "llm",
    teacherModel: null,
    connection: null,
    recommendations: [],
  };
}

describe("buildTeacherRequest", () => {
  it("carries the current model and version, and passes the shared contract", () => {
    const request = buildTeacherRequest(agent, [line("user", "I want to teach meeting note summaries")], ID);
    expect(request.studentModel?.modelId).toBe("acme/m");
    expect(request.profileVersion).toBe(2);
    expect(request.userGoal).toBe("I want to teach meeting note summaries");
    expect(TeacherRequest.safeParse(request).success).toBe(true);
  });

  it("stays within the contract for a very long reply and a long history", () => {
    const lines: ConsultLine[] = [];
    for (let index = 0; index < 150; index++) {
      lines.push(line("user", "Question", index), line("teacher", "x".repeat(9000), index));
    }
    lines.push(line("user", "Last"));
    const request = buildTeacherRequest(agent, lines, ID);
    expect(TeacherRequest.safeParse(request).success).toBe(true);
    expect(request.messages[0].role).toBe("user");
    expect(request.messages.at(-1)?.content).toBe("Last");
  });
});

describe("contextMessages", () => {
  it("never starts the context on a teacher turn after trimming", () => {
    const lines = Array.from({ length: 41 }, (_, index) => line(index % 2 ? "teacher" : "user", "x", index));
    expect(contextMessages(lines)[0].role).toBe("user");
  });
});

describe("isCurrentResponse", () => {
  const base = { requestId: "r", agentId: ID, profileVersion: 2 };
  it("accepts only the matching request on the current version", () => {
    expect(isCurrentResponse(base, { requestId: "r", agent })).toBe(true);
    expect(isCurrentResponse(base, { requestId: "other", agent })).toBe(false);
    expect(isCurrentResponse({ ...base, profileVersion: 1 }, { requestId: "r", agent })).toBe(false);
  });
});

describe("modelKey", () => {
  it("tells models and an empty selection apart", () => {
    expect(modelKey(model)).not.toBe(modelKey({ ...model, modelId: "acme/other" }));
    expect(modelKey(model)).not.toBe(modelKey({ ...model, revision: "abc" }));
    expect(modelKey(null)).toBe("none");
  });
});

describe("safeHttpUrl", () => {
  it("only allows http and https links", () => {
    expect(safeHttpUrl("https://example.com/a")).toBe("https://example.com/a");
    expect(safeHttpUrl("javascript:alert(1)")).toBeNull();
    expect(safeHttpUrl("data:text/html,x")).toBeNull();
    expect(safeHttpUrl(null)).toBeNull();
  });
});
