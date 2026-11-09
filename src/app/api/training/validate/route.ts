import { validateTraining } from "@/server/training";
import { TrainingSpec } from "@/shared/contracts";
import { handler, parseJson } from "../../_lib/route";

export const POST = handler(async ({ req, ctx }) => {
  const input = await parseJson(req, TrainingSpec);
  return input.ok ? validateTraining(input.data, ctx) : input;
});
