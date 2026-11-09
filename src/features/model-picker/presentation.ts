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
  { key: "listed", label: "Listed" },
  { key: "accessible", label: "Access" },
  { key: "filesPreparable", label: "File preparation" },
  { key: "inference", label: "Inference" },
  { key: "training", label: "Training" },
  { key: "accountVerified", label: "Run on this account" },
];

export function claimView(claim: CapabilityClaim): { tone: StatusTone; label: string } {
  switch (claim.support) {
    case "yes":
      // A "yes" nobody can trace is not presented as a confirmed yes.
      return claim.evidence ? { tone: "ok", label: "Yes" } : { tone: "unknown", label: "Yes · no evidence" };
    case "no":
      return { tone: "danger", label: "No" };
    case "unknown":
      return { tone: "unknown", label: "Unknown" };
  }
}

export const EVIDENCE_LABEL: Record<EvidenceLevel, string> = {
  USER_CONFIRMED: "User confirmed",
  DESIGN_DRAFT: "Design draft",
  ASSISTANT_PROPOSED: "Proposed",
  DOC_REVIEWED: "Official docs reviewed",
  RUNTIME_VERIFIED: "Verified by a real run",
  UNKNOWN: "Unknown",
  DEFERRED: "Deferred",
};

export const FRESHNESS_VIEW: Record<Freshness, { tone: StatusTone; label: string }> = {
  live: { tone: "ok", label: "Live" },
  cached: { tone: "unknown", label: "Cached" },
  published_doc: { tone: "unknown", label: "From published docs" },
  fetch_failed: { tone: "danger", label: "Fetch failed" },
};

export const PREPARATION_VIEW: Record<ModelPreparationStatus, { tone: StatusTone; label: string }> = {
  preparing: { tone: "warn", label: "Preparing" },
  ready: { tone: "ok", label: "Ready" },
  failed: { tone: "danger", label: "Failed" },
  unknown: { tone: "unknown", label: "Status unknown" },
};

export const LOCATION_LABEL = {
  provider_storage: "Provider storage",
  local_disk: "Local disk",
  remote_hub: "Remote model hub",
} as const;

/** Without a measured value, task, dataset and source, a number cannot be compared with another. */
export function isComparableScore(score: BenchmarkScore): boolean {
  return score.score !== null && score.task !== null && score.dataset !== null && score.sourceUrl !== null;
}

export function formatScore(score: BenchmarkScore): string {
  if (score.score === null) return "Not measured";
  return score.unit ? `${score.score} ${score.unit}` : String(score.score);
}

const DATE_TIME = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });

export function formatDateTime(iso: string): string {
  return DATE_TIME.format(new Date(iso));
}
