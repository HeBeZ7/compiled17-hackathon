import { getPriceQuote } from "@/server/pricing";
import { PriceQuoteRequest } from "@/shared/contracts";
import { handler, parseJson } from "../../_lib/route";

export const POST = handler(async ({ req, ctx }) => {
  const input = await parseJson(req, PriceQuoteRequest);
  return input.ok ? getPriceQuote(input.data, ctx) : input;
});
