import type { EvidenceLevel } from "@/shared/contracts";

export const EVIDENCE_LABEL: Record<EvidenceLevel, string> = {
  USER_CONFIRMED: "사용자 확정",
  DESIGN_DRAFT: "설계 초안",
  ASSISTANT_PROPOSED: "제안 · 근거 미확인",
  DOC_REVIEWED: "문서 확인",
  RUNTIME_VERIFIED: "실행 확인",
  UNKNOWN: "미확인",
  DEFERRED: "보류",
};

export function formatDateTime(iso: string | null): string {
  if (!iso) return "미확인";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "미확인" : date.toLocaleString("ko-KR");
}

/** The contract's URL check accepts any scheme, so links are limited to http(s) before rendering. */
export function safeHttpUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const { protocol } = new URL(url);
    return protocol === "http:" || protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}
