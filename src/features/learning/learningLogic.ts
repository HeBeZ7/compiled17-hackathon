import type {
  AgentProfile,
  ApiErrorCode,
  Freshness,
  ModelArtifact,
  PriceQuote,
  RuntimeStatus,
  TrainingDataset,
  TrainingMethod,
  TrainingRun,
  TrainingSpec,
  TrainingStatus,
  TrainingValidation,
} from "@/shared/contracts";
import type { StatusTone } from "@/shared/ui";
import { formatDateTime } from "@/features/teacher/format";

export interface StatusCopy {
  tone: StatusTone;
  label: string;
  detail: string;
}

export const TRAINING_STATUS_COPY: Record<TrainingStatus, StatusCopy> = {
  draft: { tone: "unknown", label: "초안", detail: "아직 학습을 요청하지 않았습니다." },
  validating: { tone: "unknown", label: "조건 확인 중", detail: "서버가 학습 조건을 확인하고 있습니다." },
  ready: { tone: "ok", label: "요청 가능", detail: "조건을 통과했지만 아직 학습을 요청하지 않았습니다." },
  blocked: { tone: "warn", label: "준비 필요", detail: "조건이 충족되지 않아 학습을 시작할 수 없습니다." },
  submitting: { tone: "unknown", label: "요청 전송 중", detail: "공급자에게 요청을 보내는 중입니다. 아직 접수가 확인되지 않았습니다." },
  queued: { tone: "unknown", label: "대기 중", detail: "공급자가 접수했고 GPU 실행은 아직 시작되지 않았습니다." },
  running: { tone: "ok", label: "실행 중", detail: "공급자가 실행 중이라고 보고했습니다." },
  cancel_requested: {
    tone: "warn",
    label: "취소 요청됨",
    detail: "공급자가 확인하기 전까지 취소가 확정된 것이 아니며, 과금이 멈췄다고 볼 수 없습니다.",
  },
  canceled: { tone: "unknown", label: "취소 확인됨", detail: "공급자가 취소를 확인했습니다. 이미 발생한 비용은 공급자 청구를 확인해야 합니다." },
  status_unknown: {
    tone: "unknown",
    label: "상태 불명",
    detail: "요청 결과를 확인하지 못했습니다. 실패로 단정하지 않으며, 중복 실행을 막기 위해 자동으로 다시 요청하지 않습니다.",
  },
  verifying_artifact: { tone: "unknown", label: "결과물 확인 중", detail: "공급자가 성공을 보고했지만 결과물은 아직 확인되지 않았습니다." },
  completed: { tone: "ok", label: "학습 완료", detail: "결과물까지 확인되었습니다. 실제 사용 가능 여부와 성능은 아래 항목을 따로 확인하세요." },
  failed: { tone: "danger", label: "실패", detail: "학습이 실패로 끝났습니다." },
};

const POLLED_STATUSES: readonly TrainingStatus[] = [
  "validating",
  "submitting",
  "queued",
  "running",
  "cancel_requested",
  "status_unknown",
  "verifying_artifact",
];

export function shouldPoll(status: TrainingStatus): boolean {
  return POLLED_STATUSES.includes(status);
}

const POLL_BASE_MS = 5_000;
const POLL_MAX_MS = 60_000;

export function nextPollDelay(consecutiveFailures: number): number {
  return Math.min(POLL_BASE_MS * 2 ** consecutiveFailures, POLL_MAX_MS);
}

export function canCancel(run: Pick<TrainingRun, "status" | "providerJobId">): boolean {
  if (run.status === "queued" || run.status === "running") return true;
  return (run.status === "status_unknown" || run.status === "submitting") && run.providerJobId !== null;
}

/**
 * After a create call, only these codes prove no run was started. Anything else
 * (a timeout, a dropped connection) may have reached the provider.
 */
const DEFINITELY_NOT_CREATED: readonly ApiErrorCode[] = [
  "NOT_CONNECTED",
  "INVALID_REQUEST",
  "NOT_FOUND",
  "CONFLICT",
  "UNSUPPORTED",
  "BLOCKED",
  "PAYLOAD_TOO_LARGE",
  "RATE_LIMITED",
];

export function classifyCreateFailure(code: ApiErrorCode): "rejected" | "unknown" {
  return DEFINITELY_NOT_CREATED.includes(code) ? "rejected" : "unknown";
}

/** Overlapping responses resolve by provider-side recency, so an old poll cannot undo a newer state. */
export function mergeRun(runs: TrainingRun[], incoming: TrainingRun): TrainingRun[] {
  const existing = runs.find((run) => run.runId === incoming.runId);
  if (!existing) return [incoming, ...runs];
  if (incoming.updatedAt < existing.updatedAt) return runs;
  return runs.map((run) => (run.runId === incoming.runId ? incoming : run));
}

export function runsForAgent(runs: TrainingRun[], agentId: string): TrainingRun[] {
  return runs.filter((run) => run.spec.agentId === agentId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function activeRun(runs: TrainingRun[]): TrainingRun | null {
  return runs.find((run) => shouldPoll(run.status)) ?? null;
}

export function parsePositive(text: string): number | null {
  const value = Number(text.trim());
  return text.trim() !== "" && Number.isFinite(value) && value > 0 ? value : null;
}

const CURRENCY_CODE = /^[A-Z]{3}$/;

export function normalizeCurrency(text: string): string | null {
  const code = text.trim().toUpperCase();
  return CURRENCY_CODE.test(code) ? code : null;
}

export const FRESHNESS_LABEL: Record<Freshness, string> = {
  live: "방금 조회한 값",
  cached: "저장된 값",
  published_doc: "공개 문서 가격 · 실시간 재고나 확정 견적 아님",
  fetch_failed: "조회 실패",
};

export function formatAmount(value: number | null, currency: string | null): string {
  if (value === null) return "미확인";
  return `${value.toLocaleString("ko-KR", { maximumFractionDigits: 6 })} ${currency ?? "(통화 미확인)"}`;
}

/** A price the user can approve: looked up successfully and actually known. Zero is a real value. */
export function isPriceKnown(quote: PriceQuote): boolean {
  return quote.freshness !== "fetch_failed" && quote.unitPrice !== null;
}

export interface SpecInput {
  agent: AgentProfile | null;
  dataset: TrainingDataset | null;
  method: TrainingMethod | null;
  quote: PriceQuote | null;
  limitCurrency: string;
  limitAmount: string;
}

export function buildTrainingSpec(input: SpecInput): TrainingSpec | null {
  const { agent, dataset, method, quote } = input;
  const currency = normalizeCurrency(input.limitCurrency);
  const amount = parsePositive(input.limitAmount);
  if (!agent?.selectedModel || !dataset || !method || !quote || !currency || amount === null) return null;
  return {
    agentId: agent.agentId,
    profileVersion: agent.version,
    baseModel: agent.selectedModel,
    method,
    datasetId: dataset.datasetId,
    // Hyperparameters stay with the provider path E verifies; no invented defaults here.
    config: {},
    provider: quote.provider,
    costLimit: { currency, amount },
  };
}

export interface SubmitInput extends SpecInput {
  validation: TrainingValidation | null;
  costApproved: boolean;
  submitting: boolean;
  hasPendingRequest: boolean;
  activeRun: TrainingRun | null;
}

/** Empty means ready. The server still re-checks; this only prevents a request that cannot be approved. */
export function submitBlockers(input: SubmitInput): string[] {
  const blockers: string[] = [];
  if (!input.agent) blockers.push("에이전트가 필요합니다.");
  else if (!input.agent.selectedModel) blockers.push("학생 모델을 선택해야 합니다.");
  if (!input.dataset) blockers.push("학습 자료를 저장해야 합니다.");
  else if (input.dataset.validation === "invalid") blockers.push("학습 자료 검증을 통과하지 못했습니다.");
  if (!input.method) blockers.push("학습 방식을 골라야 합니다.");
  if (!input.quote) blockers.push("가격을 조회해야 합니다.");
  else if (!isPriceKnown(input.quote)) blockers.push("가격을 확인하지 못해 비용을 승인할 수 없습니다.");
  if (normalizeCurrency(input.limitCurrency) === null || parsePositive(input.limitAmount) === null) {
    blockers.push("비용 한도의 통화와 금액을 입력해야 합니다.");
  }
  if (input.validation?.status !== "ready") blockers.push("서버 조건 확인을 통과해야 합니다.");
  if (!input.costApproved) blockers.push("비용 한도를 직접 승인해야 합니다.");
  if (input.activeRun) blockers.push("아직 끝나지 않은 학습이 있습니다.");
  if (input.hasPendingRequest || input.submitting) blockers.push("결과를 확인하지 못한 요청이 있습니다.");
  return blockers;
}

export function limitBelowEstimate(quote: PriceQuote | null, currencyText: string, amountText: string): boolean {
  const amount = parsePositive(amountText);
  return (
    quote?.estimatedTotal != null &&
    amount !== null &&
    quote.currency === normalizeCurrency(currencyText) &&
    quote.estimatedTotal > amount
  );
}

export function describeArtifact(artifact: ModelArtifact | null, artifactId: string | null): StatusCopy {
  if (!artifactId) return { tone: "unknown", label: "결과물 없음", detail: "아직 연결된 결과물이 없습니다." };
  if (!artifact) return { tone: "unknown", label: "확인 전", detail: "결과물 정보를 아직 받지 못했습니다." };
  if (!artifact.existenceVerified) {
    return { tone: "warn", label: "존재 미확인", detail: "공급자 응답은 있지만 실제 파일을 확인하지 못했습니다." };
  }
  return { tone: "ok", label: "결과물 확인됨", detail: `확인 시각 ${formatDateTime(artifact.verifiedAt)}` };
}

export function describeRuntime(runtime: RuntimeStatus | null): StatusCopy {
  if (!runtime) return { tone: "unknown", label: "확인 전", detail: "실행 상태를 아직 받지 못했습니다." };
  switch (runtime.state) {
    case "not_loaded":
      return { tone: "unknown", label: "로드 전", detail: "결과물이 있어도 아직 모델로 불러오지 않았습니다." };
    case "loading":
      return { tone: "unknown", label: "로드 중", detail: "모델을 불러오는 중입니다." };
    case "load_failed":
      return { tone: "danger", label: "로드 실패", detail: "학습 결과와 별개로 모델을 불러오지 못했습니다." };
    case "unknown":
      return { tone: "unknown", label: "상태 불명", detail: "실행 상태를 확인하지 못했습니다." };
    case "loaded":
      return runtime.responseVerifiedAt
        ? { tone: "ok", label: "실제 응답 확인됨", detail: `응답 확인 ${formatDateTime(runtime.responseVerifiedAt)}. 성능 평가는 아닙니다.` }
        : { tone: "warn", label: "로드됨 · 응답 미확인", detail: "로드는 되었지만 실제 응답을 아직 확인하지 못했습니다." };
  }
}

export function describeTrainingOutcome(run: Pick<TrainingRun, "status" | "trainingCompleted">): StatusCopy {
  if (run.trainingCompleted) return { tone: "ok", label: "공급자 완료 보고", detail: "공급자가 학습 완료를 보고했습니다." };
  if (run.status === "failed") return { tone: "danger", label: "실패", detail: "학습이 끝나지 못했습니다." };
  if (run.status === "canceled") return { tone: "unknown", label: "취소됨", detail: "학습이 완료되지 않았습니다." };
  return { tone: "unknown", label: "완료 보고 없음", detail: "공급자의 완료 보고를 아직 받지 못했습니다." };
}
