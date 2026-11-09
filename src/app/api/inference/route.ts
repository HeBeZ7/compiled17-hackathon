import { runInference } from "@/server/inference";
import { InferenceRequest } from "@/shared/contracts";
import { handler, parseJson } from "../_lib/route";

export const POST = handler(async ({ req, ctx }) => {
  const input = await parseJson(req, InferenceRequest);
  return input.ok ? runInference(input.data, ctx) : input;
});
