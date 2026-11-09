import { z } from "zod";
import { ConnectionState, Evidence, IsoTimestamp } from "./common";
import { ModelReference } from "./model";

export const TeacherMessage = z.object({
  role: z.enum(["user", "teacher"]),
  content: z.string().min(1).max(8000),
  at: IsoTimestamp,
});
export type TeacherMessage = z.infer<typeof TeacherMessage>;

export const TeacherRequest = z.object({
  /** Client-generated. Echoed back so a late response can be dropped. */
  requestId: z.uuid(),
  agentId: z.uuid(),
  profileVersion: z.number().int().min(1),
  /** The user's student model. Not the model that powers the teacher. */
  studentModel: ModelReference.nullable(),
  messages: z.array(TeacherMessage).min(1).max(100),
  userGoal: z.string().max(4000).nullable(),
});
export type TeacherRequest = z.infer<typeof TeacherRequest>;

export const TeacherRecommendation = z.object({
  kind: z.enum(["keep_model", "consider_alternative", "training_direction", "need_more_info"]),
  summary: z.string(),
  /** A suggestion only. Never applied to the profile without a user action. */
  alternativeModel: ModelReference.nullable(),
  evidence: z.array(Evidence),
  limitations: z.string().nullable(),
});
export type TeacherRecommendation = z.infer<typeof TeacherRecommendation>;

export const TeacherResponse = z.object({
  requestId: z.uuid(),
  agentId: z.uuid(),
  profileVersion: z.number().int().min(1),
  reply: z.string(),
  /** `static_notice` must never be rendered as a personalized model answer. */
  replySource: z.enum(["llm", "static_notice"]),
  teacherModel: z.object({ provider: z.string(), modelId: z.string() }).nullable(),
  studentModel: ModelReference.nullable(),
  recommendations: z.array(TeacherRecommendation),
  connection: ConnectionState,
});
export type TeacherResponse = z.infer<typeof TeacherResponse>;

/** Server gateway D calls and E implements (src/server/llm). */
export const LlmChatRequest = z.object({
  system: z.string().nullable(),
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })).min(1),
  maxOutputTokens: z.number().int().min(1).max(8192).nullable(),
});
export type LlmChatRequest = z.infer<typeof LlmChatRequest>;

export const LlmChatResponse = z.object({
  text: z.string(),
  provider: z.string(),
  modelId: z.string(),
  connection: ConnectionState,
});
export type LlmChatResponse = z.infer<typeof LlmChatResponse>;
