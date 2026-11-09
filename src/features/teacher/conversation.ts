import type {
  AgentProfile,
  ConnectionState,
  ModelReference,
  TeacherMessage,
  TeacherRecommendation,
  TeacherRequest,
  TeacherResponse,
} from "@/shared/contracts";

export const MAX_MESSAGE_LENGTH = 8000;
const MAX_GOAL_LENGTH = 4000;
const MAX_CONTEXT_MESSAGES = 40;

export interface ConsultLine extends TeacherMessage {
  id: string;
  source: "user" | "llm" | "static_notice";
  teacherModel: TeacherResponse["teacherModel"];
  connection: ConnectionState | null;
  recommendations: TeacherRecommendation[];
}

export function modelKey(model: ModelReference | null): string {
  return model ? JSON.stringify([model.source, model.modelId, model.revision]) : "none";
}

/** Contract limits apply to the whole history, so the oldest turns go first and context starts on a user turn. */
export function contextMessages(lines: ConsultLine[]): TeacherMessage[] {
  const recent = lines.slice(-MAX_CONTEXT_MESSAGES);
  const firstUser = recent.findIndex((line) => line.role === "user");
  return recent.slice(Math.max(firstUser, 0)).map(({ role, content, at }) => ({
    role,
    content: content.slice(0, MAX_MESSAGE_LENGTH),
    at,
  }));
}

export function buildTeacherRequest(agent: AgentProfile, lines: ConsultLine[], requestId: string): TeacherRequest {
  const goal = lines.find((line) => line.role === "user")?.content.slice(0, MAX_GOAL_LENGTH) ?? null;
  return {
    requestId,
    agentId: agent.agentId,
    profileVersion: agent.version,
    studentModel: agent.selectedModel,
    messages: contextMessages(lines),
    userGoal: goal,
  };
}

/** A late answer for an older selection must not land in the current conversation. */
export function isCurrentResponse(
  response: Pick<TeacherResponse, "requestId" | "agentId" | "profileVersion">,
  expected: { requestId: string; agent: AgentProfile },
): boolean {
  return (
    response.requestId === expected.requestId &&
    response.agentId === expected.agent.agentId &&
    response.profileVersion === expected.agent.version
  );
}
