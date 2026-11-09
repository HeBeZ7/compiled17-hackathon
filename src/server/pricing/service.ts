import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { COLLECTIONS, type Store } from "@/server/store/store";
import { nebiusMethodsFor } from "@/server/training/nebiusModels";
import { fail, ok, type PriceQuote, type PriceQuoteRequest, type RequestContext, type ServiceResult } from "@/shared/contracts";

const NEBIUS_PRICES_URL = "https://tokenfactory.nebius.com/organization/prices";
const NOT_PUBLISHED_NOTE = "공개 문서에서 Nebius 파인튜닝 토큰 단가를 확인하지 못했습니다. 무료라는 뜻이 아닙니다.";

export const TRAINING_PRICES_ENV = "NEBIUS_FINE_TUNING_USD_PER_1M_TOKENS_JSON";

export interface TrainingPrice {
  unitPrice: number;
  currency: string;
  unit: string;
  sourceUrl: string;
  note: string;
}

export interface PriceProvider {
  id: string;
  /** null = no known price. A throw = the lookup itself failed. Neither reads as free. */
  trainingPrice(modelId: string): Promise<TrainingPrice | null>;
}

const OperatorPrices = z.record(z.string(), z.number().positive());

/**
 * Nebius publishes no training rate outside the signed-in console, so the only
 * source is a value the operator copied from that console.
 */
export const operatorPriceProvider: PriceProvider = {
  id: "nebius",
  async trainingPrice(modelId) {
    const raw = process.env[TRAINING_PRICES_ENV];
    if (!raw) return null;
    const unitPrice = OperatorPrices.parse(JSON.parse(raw))[modelId];
    if (unitPrice === undefined) return null;
    return {
      unitPrice,
      currency: "USD",
      unit: "per_1m_training_tokens",
      sourceUrl: NEBIUS_PRICES_URL,
      note: "운영자가 Nebius 콘솔에서 옮겨 적은 값입니다. 실시간 조회나 확정 견적이 아닙니다.",
    };
  },
};

export interface PricingDeps {
  store: Store;
  prices: PriceProvider;
}

export function createPricingService({ store, prices }: PricingDeps) {
  return {
    async getPriceQuote(input: PriceQuoteRequest, ctx: RequestContext): Promise<ServiceResult<PriceQuote>> {
      if (input.provider !== null && input.provider !== prices.id) return fail("UNSUPPORTED", `가격을 조회할 수 없는 공급자입니다: ${input.provider}`);
      const modelId = input.baseModel.modelId;
      const methods = nebiusMethodsFor(modelId);
      if (methods.length === 0 || (input.method !== null && !methods.includes(input.method))) {
        return fail("UNSUPPORTED", "이 모델과 학습 방식은 연결된 공급자의 지원 목록에 없습니다.");
      }

      let price: TrainingPrice | null = null;
      let lookupFailed = false;
      try {
        price = await prices.trainingPrice(modelId);
      } catch {
        lookupFailed = true;
      }

      const queriedAt = new Date().toISOString();
      const quote: PriceQuote = {
        quoteId: randomUUID(),
        provider: prices.id,
        region: null,
        gpuType: null,
        currency: price?.currency ?? null,
        unit: price?.unit ?? null,
        unitPrice: price?.unitPrice ?? null,
        // The request carries no dataset size, so no total can be estimated here.
        estimatedTotal: null,
        queriedAt,
        sourceUrl: price?.sourceUrl ?? NEBIUS_PRICES_URL,
        freshness: price ? "published_doc" : "fetch_failed",
        cachedAt: null,
        excludedCosts: ["결과 모델의 추론·배포 비용"],
        notes: price?.note ?? (lookupFailed ? "가격 조회에 실패했습니다. 무료라는 뜻이 아닙니다." : NOT_PUBLISHED_NOTE),
      };
      store.put(COLLECTIONS.priceCache, ctx.ownerId, quote.quoteId, quote);
      return ok(quote);
    },
  };
}
