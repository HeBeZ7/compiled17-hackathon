import "server-only";
import { notConnected, type RequestContext, type ServiceResult, type TeacherRequest, type TeacherResponse } from "@/shared/contracts";

// D owns this module. Build the prompt here and call completeChat from @/server/llm.

export async function askTeacher(_input: TeacherRequest, _ctx: RequestContext): Promise<ServiceResult<TeacherResponse>> {
  return notConnected("선생님 상담");
}
