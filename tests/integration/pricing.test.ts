import { beforeEach, describe, expect, it } from "vitest";
import { bindings } from "../support/load-bindings";
import type { LivePrice, PricingHarness } from "../support/ports";

// 가격 원천은 테스트 대역이다. 실제 공급자 가격 조회(A-08)의 증거가 아니다.
describe.skipIf(!bindings.pricing)("[대역] 가격 조회와 미확인 값", () => {
  let h: PricingHarness;
  const price: LivePrice = {
    provider: "fixture-cloud", region: "fixture-region-1", currency: "USD", unit: "GPU-hour",
    unitPrice: 2.5, queriedAt: "2026-11-09T00:00:00.000Z", source: "https://fixture.invalid/prices",
  };

  beforeEach(async () => { h = await bindings.pricing!(); });

  it("P1 조회 실패는 단가·총액 null이며 0으로 바꾸지 않는다", async () => {
    h.source.fail();
    const q = await h.getQuote({ hours: 3 });
    expect(q.unitPrice).toBeNull();
    expect(q.estimatedTotal).toBeNull();
    expect(q.freshness).toBe("fetch_failed");
  });

  it("P2 정상 조회는 공급자·지역·통화·단위·단가·시각·출처를 보존한다", async () => {
    h.source.respondLive(price);
    const q = await h.getQuote({ hours: null });
    expect(q).toMatchObject({
      provider: price.provider, region: price.region, currency: price.currency, unit: price.unit,
      unitPrice: price.unitPrice, queriedAt: price.queriedAt, source: price.source,
      cached: false, freshness: "live",
    });
  });

  it("P3 통화나 단위가 없으면 지어내지 않는다", async () => {
    h.source.respondPartial({ provider: price.provider, unitPrice: price.unitPrice });
    const q = await h.getQuote({ hours: 3 });
    expect(q.currency).toBeNull();
    expect(q.unit).toBeNull();
    expect(q.region).toBeNull();
    expect(q.estimatedTotal).toBeNull();
  });

  it("P4 학습 시간을 모르면 총액 추정은 null이다", async () => {
    h.source.respondLive(price);
    expect((await h.getQuote({ hours: null })).estimatedTotal).toBeNull();
  });

  it("P5 문서 공개 가격을 실시간 가격으로 표시하지 않는다", async () => {
    h.source.respondPublishedDoc(price);
    const q = await h.getQuote({ hours: null });
    expect(q.freshness).toBe("published_doc");
  });

  it("P6 조회 실패 후 이전 값을 보여주면 원래 조회 시각과 캐시 표시를 유지한다", async () => {
    h.source.respondLive(price);
    await h.getQuote({ hours: null });
    h.source.fail();
    const q = await h.getQuote({ hours: null });
    expect(q.freshness).not.toBe("live");
    if (q.unitPrice !== null) {
      expect(q.cached).toBe(true);
      expect(q.queriedAt).toBe(price.queriedAt);
    }
  });
});
