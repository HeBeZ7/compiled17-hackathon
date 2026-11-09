import type { CapabilityClaim, TrainingMethod } from "@/shared/contracts";

/**
 * Transcribed from the official table on 2026-11-09. Documented support only:
 * this does not show that any account can run these jobs.
 */
export const NEBIUS_MODELS_DOC_URL = "https://docs.tokenfactory.nebius.com/fine-tuning/models";
const CHECKED_AT = "2026-11-09T00:00:00.000Z";

const LORA_AND_FULL: readonly TrainingMethod[] = ["lora", "full"];

export const NEBIUS_FINE_TUNING_MODELS: Readonly<Record<string, readonly TrainingMethod[]>> = {
  "deepseek-ai/DeepSeek-V3-0324": ["full"],
  "meta-llama/Llama-3.2-1B-Instruct": LORA_AND_FULL,
  "meta-llama/Llama-3.2-3B-Instruct": LORA_AND_FULL,
  "meta-llama/Llama-3.1-8B-Instruct": LORA_AND_FULL,
  "meta-llama/Llama-3.1-70B": LORA_AND_FULL,
  "meta-llama/Llama-3.3-70B-Instruct": LORA_AND_FULL,
  "unsloth/gpt-oss-20b-BF16": LORA_AND_FULL,
  "unsloth/gpt-oss-120b-BF16": LORA_AND_FULL,
  "Qwen/Qwen3-14B": LORA_AND_FULL,
  "Qwen/Qwen3-32B": LORA_AND_FULL,
};

export function nebiusMethodsFor(modelId: string): readonly TrainingMethod[] {
  return NEBIUS_FINE_TUNING_MODELS[modelId] ?? [];
}

/** Absent from this one table is "unknown", not "no": another provider may train it. */
export function nebiusTrainingClaim(modelId: string): CapabilityClaim {
  const methods = nebiusMethodsFor(modelId);
  return {
    support: methods.length > 0 ? "yes" : "unknown",
    evidence: {
      level: methods.length > 0 ? "DOC_REVIEWED" : "UNKNOWN",
      sourceUrl: NEBIUS_MODELS_DOC_URL,
      checkedAt: CHECKED_AT,
      note:
        methods.length > 0
          ? `Nebius 공식 표 기준 지원 방식: ${methods.join(", ")}. 현재 계정 실행은 미확인.`
          : "Nebius 파인튜닝 지원 표에 없는 모델.",
    },
  };
}
