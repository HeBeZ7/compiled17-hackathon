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
  draft: { tone: "unknown", label: "Draft", detail: "Training has not been requested yet" },
  validating: { tone: "unknown", label: "Checking conditions", detail: "The server is checking the training conditions" },
  ready: { tone: "ok", label: "Ready to request", detail: "Conditions passed but training has not been requested yet" },
  blocked: { tone: "warn", label: "Needs preparation", detail: "Conditions are not met so training cannot start" },
  submitting: { tone: "unknown", label: "Sending request", detail: "Sending the request to the provider · acceptance is not confirmed yet" },
  queued: { tone: "unknown", label: "Queued", detail: "The provider accepted it and GPU execution has not started yet" },
  running: { tone: "ok", label: "Running", detail: "The provider reports it is running" },
  cancel_requested: {
    tone: "warn",
    label: "Cancel requested",
    detail: "The cancellation is not confirmed until the provider acknowledges it · billing may not have stopped",
  },
  canceled: { tone: "unknown", label: "Cancel confirmed", detail: "The provider confirmed the cancellation · check the provider bill for costs already incurred" },
  status_unknown: {
    tone: "unknown",
    label: "Status unknown",
    detail: "The request outcome could not be confirmed · it is not treated as failed and is never resent automatically, to avoid a duplicate run",
  },
  verifying_artifact: { tone: "unknown", label: "Verifying artifact", detail: "The provider reported success but the artifact is not confirmed yet" },
  completed: { tone: "ok", label: "Training complete", detail: "Artifact verified · check real use and performance separately below" },
  failed: { tone: "danger", label: "Failed", detail: "Training ended in failure" },
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
  live: "Just queried",
  cached: "Saved value",
  published_doc: "Published docs price · not live stock or a firm quote",
  fetch_failed: "Lookup failed",
};

export function formatAmount(value: number | null, currency: string | null): string {
  if (value === null) return "Unknown · not free";
  return `${value.toLocaleString("en-US", { maximumFractionDigits: 6 })} ${currency ?? "(currency unknown)"}`;
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
  if (!input.agent) blockers.push("An agent is required");
  else if (!input.agent.selectedModel) blockers.push("Choose a student model");
  if (!input.dataset) blockers.push("Save training data");
  else if (input.dataset.validation === "invalid") blockers.push("Training data failed validation");
  if (!input.method) blockers.push("Choose a training method");
  if (!input.quote) blockers.push("Check the price");
  else if (!isPriceKnown(input.quote)) blockers.push("Price is unconfirmed so the cost cannot be approved");
  if (normalizeCurrency(input.limitCurrency) === null || parsePositive(input.limitAmount) === null) {
    blockers.push("Enter the cost limit currency and amount");
  }
  if (input.validation?.status !== "ready") blockers.push("Pass the server conditions check");
  if (!input.costApproved) blockers.push("Approve the cost limit yourself");
  if (input.activeRun) blockers.push("A training run is still in progress");
  if (input.hasPendingRequest || input.submitting) blockers.push("A request with an unknown outcome exists");
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
  if (!artifactId) return { tone: "unknown", label: "No artifact", detail: "No artifact is linked yet" };
  if (!artifact) return { tone: "unknown", label: "Not checked", detail: "Artifact details have not been received yet" };
  if (!artifact.existenceVerified) {
    return { tone: "warn", label: "Existence unverified", detail: "The provider responded but the actual file could not be confirmed" };
  }
  return { tone: "ok", label: "Artifact verified", detail: `Checked at ${formatDateTime(artifact.verifiedAt)}` };
}

export function describeRuntime(runtime: RuntimeStatus | null): StatusCopy {
  if (!runtime) return { tone: "unknown", label: "Not checked", detail: "Runtime status has not been received yet" };
  switch (runtime.state) {
    case "not_loaded":
      return { tone: "unknown", label: "Not loaded", detail: "The artifact has not been loaded as a model yet" };
    case "loading":
      return { tone: "unknown", label: "Loading", detail: "Loading the model" };
    case "load_failed":
      return { tone: "danger", label: "Load failed", detail: "The model could not be loaded, separately from the training result" };
    case "unknown":
      return { tone: "unknown", label: "Status unknown", detail: "Runtime status could not be confirmed" };
    case "loaded":
      return runtime.responseVerifiedAt
        ? { tone: "ok", label: "Real response verified", detail: `Response checked ${formatDateTime(runtime.responseVerifiedAt)} · not a performance evaluation` }
        : { tone: "warn", label: "Loaded · response unverified", detail: "Loaded but a real response has not been confirmed yet" };
  }
}

export function describeTrainingOutcome(run: Pick<TrainingRun, "status" | "trainingCompleted">): StatusCopy {
  if (run.trainingCompleted) return { tone: "ok", label: "Provider reported complete", detail: "The provider reported training complete" };
  if (run.status === "failed") return { tone: "danger", label: "Failed", detail: "Training did not finish" };
  if (run.status === "canceled") return { tone: "unknown", label: "Canceled", detail: "Training did not complete" };
  return { tone: "unknown", label: "No completion report", detail: "No completion report from the provider yet" };
}
