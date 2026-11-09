import { saveAvatarAsset } from "@/server/store";
import { fail } from "@/shared/contracts";
import { handler } from "../_lib/route";

export const POST = handler(async ({ req, ctx }) => {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail("INVALID_REQUEST", "이미지 업로드 형식이 올바르지 않습니다.");
  }
  return saveAvatarAsset(form, ctx);
});
