import "server-only";
import { lookupCatalogEntry } from "@/server/catalog";
import { completeChat } from "@/server/llm";
import { getCurrentAgent } from "@/server/store";
import {
  fail,
  isSameModel,
  ok,
  type CatalogEntry,
  type ModelReference,
  type RequestContext,
  type ServiceResult,
  type TeacherRequest,
  type TeacherResponse,
} from "@/shared/contracts";
import { buildEvidenceBook, buildSystemPrompt, toLlmRequest } from "./prompt";
import { groundRecommendations, parseTeacherOutput } from "./recommendations";

function sameSelection(a: ModelReference | null, b: ModelReference | null): boolean {
  return a === null || b === null ? a === b : isSameModel(a, b);
}

async function findStudentEntry(model: ModelReference | null, ctx: RequestContext): Promise<CatalogEntry | null> {
  if (!model) return null;
  const lookup = await lookupCatalogEntry(
    { source: model.source, modelId: model.modelId, revision: model.revision ?? undefined },
    ctx,
  );
  return lookup.ok ? lookup.data : null;
}

export interface TeacherDeps {
  completeChat: typeof completeChat;
}

export function askTeacher(input: TeacherRequest, ctx: RequestContext): Promise<ServiceResult<TeacherResponse>> {
  return askTeacherWith({ completeChat }, input, ctx);
}

/**
 * Lets a test supply or delay the LLM gateway. The stored profile, not the
 * request body, decides which student model is in context, so a stale tab
 * cannot get advice about a model it no longer has.
 */
export async function askTeacherWith(
  deps: TeacherDeps,
  input: TeacherRequest,
  ctx: RequestContext,
): Promise<ServiceResult<TeacherResponse>> {
  const current = await getCurrentAgent(ctx);
  if (!current.ok) return current;

  const profile = current.data.agent;
  if (!profile || profile.agentId !== input.agentId) {
    return fail("NOT_FOUND", "이 에이전트를 찾지 못했습니다. 에이전트를 다시 불러와 주세요.");
  }
  if (profile.version !== input.profileVersion || !sameSelection(profile.selectedModel, input.studentModel)) {
    return fail("CONFLICT", "에이전트 정보가 바뀌었습니다. 최신 모델 기준으로 다시 물어봐 주세요.");
  }
  if (input.messages.at(-1)?.role !== "user") {
    return fail("INVALID_REQUEST", "마지막 메시지는 사용자의 말이어야 합니다.");
  }

  const studentModel = profile.selectedModel;
  const studentEntry = await findStudentEntry(studentModel, ctx);
  const book = buildEvidenceBook(studentModel, studentEntry);
  const system = buildSystemPrompt({ agentName: profile.name, studentModel, book, userGoal: input.userGoal });

  const completion = await deps.completeChat(toLlmRequest(system, input.messages), ctx);
  if (!completion.ok) return completion;
  if (!completion.data.text.trim()) return fail("PROVIDER_ERROR", "선생님 모델이 빈 응답을 보냈습니다.", { retryable: true });

  const output = parseTeacherOutput(completion.data.text);
  const recommendations = await groundRecommendations(output.recommendations, {
    book,
    studentModel,
    studentEntry,
    now: new Date().toISOString(),
    ctx,
  });

  return ok({
    requestId: input.requestId,
    agentId: profile.agentId,
    profileVersion: profile.version,
    reply: output.reply,
    replySource: "llm",
    teacherModel: { provider: completion.data.provider, modelId: completion.data.modelId },
    studentModel,
    recommendations,
    connection: completion.data.connection,
  });
}
