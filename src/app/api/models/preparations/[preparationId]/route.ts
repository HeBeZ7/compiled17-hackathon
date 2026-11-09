import { getModelPreparation } from "@/server/catalog";
import { handler } from "../../../_lib/route";

export const GET = handler<{ preparationId: string }>(({ ctx, params }) => getModelPreparation(params.preparationId, ctx));
