"use client";

import type { ChangeEvent, ReactNode } from "react";
import { safeHttpUrl, formatDateTime } from "@/features/teacher/format";
import { TrainingMethod, type PriceQuote, type TrainingDataset } from "@/shared/contracts";
import { Button, ConnectionNotice, StatusBadge, type StatusTone } from "@/shared/ui";
import {
  FRESHNESS_LABEL,
  activeRun as findActiveRun,
  buildTrainingSpec,
  formatAmount,
  isPriceKnown,
  limitBelowEstimate,
  normalizeCurrency,
  parsePositive,
  submitBlockers,
} from "./learningLogic";
import styles from "./LearningPanel.module.css";
import { remoteData, selectAgentRuns, useLearningStore } from "./learningStore";

const METHOD_LABEL: Record<TrainingMethod, string> = {
  lora: "LoRA adapter",
  qlora: "QLoRA adapter",
  full: "Full parameters",
};

const DATASET_BADGE: Record<TrainingDataset["validation"], { tone: StatusTone; label: string }> = {
  pending: { tone: "unknown", label: "Validation pending" },
  valid: { tone: "ok", label: "Validation passed" },
  invalid: { tone: "danger", label: "Validation failed" },
  unknown: { tone: "unknown", label: "Validation unknown" },
};

function Step({ step, title, testId, children }: { step: number; title: string; testId?: string; children: ReactNode }) {
  return (
    <section className={styles.step} aria-label={`Step ${step} · ${title}`} data-testid={testId}>
      <h3 className={styles.stepTitle}>
        <span className={styles.stepNumber} aria-hidden="true">
          {step}
        </span>
        {title}
      </h3>
      {children}
    </section>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.fact}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function DatasetStep() {
  const { dataset, uploadDataset } = useLearningStore();
  const data = remoteData(dataset);

  const onFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void uploadDataset(file);
  };

  return (
    <Step step={1} title="Training data">
      <p className={styles.help}>
        GPU training needs a prepared data file · the goal you described to the teacher is not training data on its own
      </p>
      <label className={styles.field}>
        <span>Data file</span>
        <input type="file" onChange={onFile} disabled={dataset.state === "loading"} />
      </label>
      {dataset.state === "loading" && <p role="status">Saving data</p>}
      {dataset.state === "error" && <ConnectionNotice error={dataset.error} />}
      {data && (
        <dl className={styles.facts}>
          <Fact label="Saved file">{data.fileName}</Fact>
          <Fact label="Size">{data.sizeBytes.toLocaleString("en-US")} bytes</Fact>
          <Fact label="Validation">
            <StatusBadge tone={DATASET_BADGE[data.validation].tone}>{DATASET_BADGE[data.validation].label}</StatusBadge>
          </Fact>
          <Fact label="Format">{data.format ?? "Unknown"}</Fact>
          <Fact label="Examples">{data.exampleCount ?? "Unknown"}</Fact>
        </dl>
      )}
      {data && data.issues.length > 0 && (
        <ul className={styles.issues}>
          {data.issues.map((issue, index) => (
            <li key={index}>{issue}</li>
          ))}
        </ul>
      )}
    </Step>
  );
}

function MethodStep() {
  const { method, hours, setMethod, setHours } = useLearningStore();
  const hoursInvalid = hours.trim() !== "" && parsePositive(hours) === null;
  return (
    <Step step={2} title="Training method">
      <label className={styles.field}>
        <span>Method</span>
        <select
          value={method ?? ""}
          onChange={(event) => {
            const parsed = TrainingMethod.safeParse(event.target.value);
            setMethod(parsed.success ? parsed.data : null);
          }}
        >
          <option value="">Choose one</option>
          {TrainingMethod.options.map((option) => (
            <option key={option} value={option}>
              {METHOD_LABEL[option]}
            </option>
          ))}
        </select>
      </label>
      <p className={styles.help}>The server check below decides whether this model and method are actually possible</p>
      <label className={styles.field}>
        <span>Estimated training time in hours (optional)</span>
        <input type="text" inputMode="decimal" value={hours} onChange={(event) => setHours(event.target.value)} />
      </label>
      {hoursInvalid && <p className={styles.warn}>Enter a number greater than 0</p>}
    </Step>
  );
}

function QuoteDetails({ quote }: { quote: PriceQuote }) {
  const known = isPriceKnown(quote);
  const source = safeHttpUrl(quote.sourceUrl);
  return (
    <>
      {!known && (
        <p className={styles.warn} role="status">
          Price could not be confirmed · this does not mean free
        </p>
      )}
      <dl className={styles.facts}>
        <Fact label="Provider">{quote.provider}</Fact>
        <Fact label="Region">{quote.region ?? "Unknown"}</Fact>
        <Fact label="GPU">{quote.gpuType ?? "Unknown"}</Fact>
        <Fact label="Unit price">
          {formatAmount(quote.unitPrice, quote.currency)}
          {quote.unit ? ` / ${quote.unit}` : " (unit unknown)"}
        </Fact>
        <Fact label="Estimated total">
          {formatAmount(quote.estimatedTotal, quote.currency)}
          {quote.estimatedTotal !== null && " · estimate only and may differ from the actual bill"}
        </Fact>
        <Fact label="Value source">
          {FRESHNESS_LABEL[quote.freshness]}
          {quote.cachedAt && ` (saved ${formatDateTime(quote.cachedAt)})`}
        </Fact>
        <Fact label="Queried at">{formatDateTime(quote.queriedAt)}</Fact>
        <Fact label="Excluded costs">{quote.excludedCosts.length ? quote.excludedCosts.join(", ") : "No provider information"}</Fact>
        {source && (
          <Fact label="Source">
            <a href={source} target="_blank" rel="noreferrer noopener">
              View price source
            </a>
          </Fact>
        )}
      </dl>
      {quote.notes && <p className={styles.help}>{quote.notes}</p>}
    </>
  );
}

function PriceStep() {
  const { agent, quote, requestQuote } = useLearningStore();
  return (
    <Step step={3} title="Price check" testId="price-panel">
      <Button variant="secondary" onClick={() => void requestQuote()} disabled={!agent?.selectedModel || quote.state === "loading"}>
        {quote.state === "loading" ? "Looking up" : quote.state === "ready" ? "Check price again" : "Check price"}
      </Button>
      {quote.state === "error" && <ConnectionNotice error={quote.error} />}
      {quote.state === "ready" && <QuoteDetails quote={quote.data} />}
    </Step>
  );
}

function LimitAndValidateStep() {
  const state = useLearningStore();
  const { quote, limitCurrency, limitAmount, setLimit, validate, validation } = state;
  const spec = buildTrainingSpec({
    agent: state.agent,
    dataset: remoteData(state.dataset),
    method: state.method,
    quote: remoteData(quote),
    limitCurrency,
    limitAmount,
  });
  const result = remoteData(validation);
  const currencyInvalid = limitCurrency.trim() !== "" && normalizeCurrency(limitCurrency) === null;
  const amountInvalid = limitAmount.trim() !== "" && parsePositive(limitAmount) === null;

  return (
    <Step step={4} title="Cost limit and conditions">
      <div className={styles.row}>
        <label className={styles.field}>
          <span>Currency (such as USD)</span>
          <input type="text" maxLength={3} value={limitCurrency} onChange={(event) => setLimit({ currency: event.target.value })} />
        </label>
        <label className={styles.field}>
          <span>Run cost limit</span>
          <input type="text" inputMode="decimal" value={limitAmount} onChange={(event) => setLimit({ amount: event.target.value })} />
        </label>
      </div>
      {currencyInvalid && <p className={styles.warn}>Use a three-letter currency code</p>}
      {amountInvalid && <p className={styles.warn}>Enter a limit greater than 0</p>}
      {limitBelowEstimate(remoteData(quote), limitCurrency, limitAmount) && (
        <p className={styles.warn}>This limit is below the estimated total</p>
      )}
      <Button variant="secondary" onClick={() => void validate()} disabled={!spec || validation.state === "loading"}>
        {validation.state === "loading" ? "Checking" : "Check conditions on server"}
      </Button>
      {validation.state === "error" && <ConnectionNotice error={validation.error} />}
      {result && (
        <div className={styles.validation}>
          <StatusBadge tone={result.status === "ready" ? "ok" : "warn"}>
            {result.status === "ready" ? "Conditions passed" : "Needs preparation"}
          </StatusBadge>
          <span className={styles.help}>Checked at {formatDateTime(result.checkedAt)}</span>
          {result.reasons.map((reason, index) => (
            <ConnectionNotice key={index} error={reason} />
          ))}
        </div>
      )}
    </Step>
  );
}

function SubmitStep() {
  const state = useLearningStore();
  const runs = selectAgentRuns(state);
  const validation = remoteData(state.validation);
  const blockers = submitBlockers({
    agent: state.agent,
    dataset: remoteData(state.dataset),
    method: state.method,
    quote: remoteData(state.quote),
    limitCurrency: state.limitCurrency,
    limitAmount: state.limitAmount,
    validation,
    costApproved: state.costApproved,
    submitting: state.submitting,
    hasPendingRequest: state.pending !== null,
    activeRun: findActiveRun(runs),
  });
  const quote = remoteData(state.quote);
  const canApprove = validation?.status === "ready" && quote !== null && isPriceKnown(quote);

  return (
    <Step step={5} title="Training request">
      <label className={styles.check}>
        <input
          type="checkbox"
          checked={state.costApproved}
          disabled={!canApprove}
          onChange={(event) => state.setCostApproved(event.target.checked)}
        />
        <span>
          I understand real GPU costs may apply and the amounts shown are estimates · I approve this training request within the cost limit above
        </span>
      </label>
      <Button data-testid="training-start" onClick={() => void state.submit()} disabled={blockers.length > 0}>
        {state.submitting ? "Sending request" : "Request real training"}
      </Button>
      {blockers.length > 0 && !state.submitting && (
        <ul className={styles.blockers} aria-label="Needed before requesting">
          {blockers.map((blocker) => (
            <li key={blocker}>{blocker}</li>
          ))}
        </ul>
      )}
      {state.submitError && !state.pending && <ConnectionNotice error={state.submitError} />}
    </Step>
  );
}

export function PreparationSteps() {
  return (
    <>
      <DatasetStep />
      <MethodStep />
      <PriceStep />
      <LimitAndValidateStep />
      <SubmitStep />
    </>
  );
}
