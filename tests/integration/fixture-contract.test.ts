import { describe, expect, it } from "vitest";
import { ApiError, PriceQuote, RuntimeStatus, TrainingRun } from "@/shared/contracts";
import { apiError, quote, run, runtime, unknownQuote } from "../e2e/support/fixtures";

// 브라우저 대역 응답이 계약을 벗어나면 클라이언트가 INVALID_RESPONSE로 처리해
// 표시 검증이 엉뚱한 이유로 통과하거나 실패한다. 계약 변경을 여기서 잡는다.
describe("브라우저 대역 응답이 공통 계약을 따른다", () => {
  it.each([
    ["정상 견적", PriceQuote, quote()],
    ["미확인 견적", PriceQuote, unknownQuote()],
    ["학습 run", TrainingRun, run()],
    ["조회 오류가 있는 학습 run", TrainingRun, run({ pollError: apiError("PROVIDER_TIMEOUT", "대역") })],
    ["상태 불명 run", TrainingRun, run({ status: "status_unknown", providerJobId: null, lastObservedAt: null })],
    ["로드 실패 runtime", RuntimeStatus, runtime({ state: "load_failed", error: apiError("PROVIDER_ERROR", "대역") })],
    ["오류 응답", ApiError, apiError("PROVIDER_ERROR", "대역")],
  ])("%s", (_name, schema, value) => {
    const result = (schema as { safeParse(v: unknown): { success: boolean; error?: unknown } }).safeParse(value);
    expect(result.error).toBeUndefined();
    expect(result.success).toBe(true);
  });
});
