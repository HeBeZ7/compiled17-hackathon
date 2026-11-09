import type {
  BenchmarkScore,
  CapabilityClaim,
  EvidenceLevel,
  Freshness,
  ModelCapabilities,
  ModelPreparationStatus,
} from "@/shared/contracts";
import type { StatusTone } from "@/shared/ui";

export const CAPABILITY_ROWS: { key: keyof ModelCapabilities; label: string }[] = [
  { key: "listed", label: "목록" },
  { key: "accessible", label: "접근" },
  { key: "filesPreparable", label: "파일 준비" },
  { key: "inference", label: "추론" },
  { key: "training", label: "학습" },
  { key: "accountVerified", label: "내 계정 실행" },
];

export function claimView(claim: CapabilityClaim): { tone: StatusTone; label: string } {
  switch (claim.support) {
    case "yes":
      // A "yes" nobody can trace is not presented as a confirmed yes.
      return claim.evidence ? { tone: "ok", label: "가능" } : { tone: "unknown", label: "가능 · 근거 없음" };
    case "no":
      return { tone: "danger", label: "불가" };
    case "unknown":
      return { tone: "unknown", label: "미확인" };
  }
}

export const EVIDENCE_LABEL: Record<EvidenceLevel, string> = {
  USER_CONFIRMED: "사용자 확인",
  DESIGN_DRAFT: "잠정 설계",
  ASSISTANT_PROPOSED: "제안 단계",
  DOC_REVIEWED: "공식 문서 확인",
  RUNTIME_VERIFIED: "실제 실행 확인",
  UNKNOWN: "미확인",
  DEFERRED: "보류",
};

export const FRESHNESS_VIEW: Record<Freshness, { tone: StatusTone; label: string }> = {
  live: { tone: "ok", label: "실시간 조회" },
  cached: { tone: "unknown", label: "저장된 조회 결과" },
  published_doc: { tone: "unknown", label: "공개 문서 기준" },
  fetch_failed: { tone: "danger", label: "조회 실패" },
};

export const PREPARATION_VIEW: Record<ModelPreparationStatus, { tone: StatusTone; label: string }> = {
  preparing: { tone: "warn", label: "준비 중" },
  ready: { tone: "ok", label: "준비 완료" },
  failed: { tone: "danger", label: "준비 실패" },
  unknown: { tone: "unknown", label: "상태 불명" },
};

export const LOCATION_LABEL = {
  provider_storage: "공급자 저장소",
  local_disk: "로컬 디스크",
  remote_hub: "원격 모델 허브",
} as const;

/** Without a measured value, task, dataset and source, a number cannot be compared with another. */
export function isComparableScore(score: BenchmarkScore): boolean {
  return score.score !== null && score.task !== null && score.dataset !== null && score.sourceUrl !== null;
}

export function formatScore(score: BenchmarkScore): string {
  if (score.score === null) return "미측정";
  return score.unit ? `${score.score} ${score.unit}` : String(score.score);
}

const DATE_TIME = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" });

export function formatDateTime(iso: string): string {
  return DATE_TIME.format(new Date(iso));
}
