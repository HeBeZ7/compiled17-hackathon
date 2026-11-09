import { cancelTrainingRun } from "@/server/training";
import { handler } from "../../../../_lib/route";

export const POST = handler<{ runId: string }>(({ ctx, params }) => cancelTrainingRun(params.runId, ctx));
