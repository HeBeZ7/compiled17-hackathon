import { getTrainingRun } from "@/server/training";
import { handler } from "../../../_lib/route";

export const GET = handler<{ runId: string }>(({ ctx, params }) => getTrainingRun(params.runId, ctx));
