import "server-only";
import { getStore } from "@/server/store";
import type { PriceQuote, PriceQuoteRequest, RequestContext, ServiceResult } from "@/shared/contracts";
import { createPricingService, operatorPriceProvider } from "./service";

// E owns this module.

export { TRAINING_PRICES_ENV, createPricingService, operatorPriceProvider } from "./service";
export type { PriceProvider, PricingDeps, TrainingPrice } from "./service";

export async function getPriceQuote(input: PriceQuoteRequest, ctx: RequestContext): Promise<ServiceResult<PriceQuote>> {
  return createPricingService({ store: getStore(), prices: operatorPriceProvider }).getPriceQuote(input, ctx);
}
