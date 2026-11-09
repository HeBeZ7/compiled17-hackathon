import { createTrainingRun, listTrainingRuns } from "@/server/training";
import { CreateTrainingRunRequest } from "@/shared/contracts";
import { handler, parseJson } from "../../_lib/route";

export const GET = handler(({ ctx }) => listTrainingRuns(ctx));

export const POST = handler(async ({ req, ctx }) => {
  const input = await parseJson(req, CreateTrainingRunRequest);
  return input.ok ? createTrainingRun(input.data, ctx) : input;
});
