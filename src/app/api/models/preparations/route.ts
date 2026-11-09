import { createModelPreparation } from "@/server/catalog";
import { ModelPreparationRequest } from "@/shared/contracts";
import { handler, parseJson } from "../../_lib/route";

export const POST = handler(async ({ req, ctx }) => {
  const input = await parseJson(req, ModelPreparationRequest);
  return input.ok ? createModelPreparation(input.data, ctx) : input;
});
