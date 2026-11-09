import type { EvidenceLevel } from "@/shared/contracts";

export const EVIDENCE_LABEL: Record<EvidenceLevel, string> = {
  USER_CONFIRMED: "User confirmed",
  DESIGN_DRAFT: "Design draft",
  ASSISTANT_PROPOSED: "Proposed · evidence unverified",
  DOC_REVIEWED: "Docs reviewed",
  RUNTIME_VERIFIED: "Runtime verified",
  UNKNOWN: "Unknown",
  DEFERRED: "Deferred",
};

export function formatDateTime(iso: string | null): string {
  if (!iso) return "Unknown";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "Unknown" : date.toLocaleString("en-US");
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
