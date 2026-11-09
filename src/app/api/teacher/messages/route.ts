import { askTeacher } from "@/server/teacher";
import { TeacherRequest } from "@/shared/contracts";
import { handler, parseJson } from "../../_lib/route";

export const POST = handler(async ({ req, ctx }) => {
  const input = await parseJson(req, TeacherRequest);
  return input.ok ? askTeacher(input.data, ctx) : input;
});
