import "server-only";
import { notConnected, type PriceQuote, type PriceQuoteRequest, type RequestContext, type ServiceResult } from "@/shared/contracts";

// E owns this module.

export async function getPriceQuote(_input: PriceQuoteRequest, _ctx: RequestContext): Promise<ServiceResult<PriceQuote>> {
  return notConnected("GPU 가격 조회");
}
