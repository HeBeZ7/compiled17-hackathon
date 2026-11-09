import { saveAvatarAsset } from "@/server/store";
import { fail } from "@/shared/contracts";
import { handler } from "../_lib/route";

export const POST = handler(async ({ req, ctx }) => {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail("INVALID_REQUEST", "The image upload format is not valid");
  }
  return saveAvatarAsset(form, ctx);
});
