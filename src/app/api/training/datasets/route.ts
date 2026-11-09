import { uploadDataset } from "@/server/training";
import { fail } from "@/shared/contracts";
import { handler } from "../../_lib/route";

export const POST = handler(async ({ req, ctx }) => {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail("INVALID_REQUEST", "학습 자료 업로드 형식이 올바르지 않습니다.");
  }
  return uploadDataset(form, ctx);
});
