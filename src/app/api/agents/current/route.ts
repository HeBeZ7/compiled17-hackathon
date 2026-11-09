import { getCurrentAgent, saveCurrentAgent } from "@/server/store";
import { SaveAgentRequest } from "@/shared/contracts";
import { handler, parseJson } from "../../_lib/route";

export const GET = handler(({ ctx }) => getCurrentAgent(ctx));

export const PUT = handler(async ({ req, ctx }) => {
  const input = await parseJson(req, SaveAgentRequest);
  return input.ok ? saveCurrentAgent(input.data, ctx) : input;
});
