"use client";

import { useEffect, useState } from "react";
import { formatDateTime } from "@/features/teacher/format";
import { api } from "@/shared/api";
import { isSameModel, type AgentProfile, type ApiError, type TrainingRun } from "@/shared/contracts";
import { Button, ConnectionNotice, StatusBadge } from "@/shared/ui";
import { TRAINING_STATUS_COPY, canCancel, nextPollDelay, shouldPoll } from "./learningLogic";
import styles from "./LearningPanel.module.css";
import { useLearningStore } from "./learningStore";
import { ResultLedger } from "./ResultLedger";

function useRunPolling(run: TrainingRun) {
  const upsertRun = useLearningStore((state) => state.upsertRun);
  const [failure, setFailure] = useState<ApiError | null>(null);
  const [failures, setFailures] = useState(0);
  const [tick, setTick] = useState(0);

  // A lookup error that retrying cannot fix stops the loop until the user asks again.
  const stopped = failure !== null && !failure.retryable;
  const polling = shouldPoll(run.status) && !stopped;

  useEffect(() => {
    if (!polling) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void api.training.get(run.runId, controller.signal).then((result) => {
        if (controller.signal.aborted) return;
        if (result.ok) {
          upsertRun(result.data);
          setFailure(null);
          setFailures(0);
          setTick((value) => value + 1);
        } else {
          setFailure(result.error);
          setFailures((value) => value + 1);
        }
      });
    }, nextPollDelay(failures));
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [polling, run.runId, failures, tick, upsertRun]);

  const checkNow = () => {
    setFailure(null);
    setFailures(0);
    setTick((value) => value + 1);
  };

  return { failure, checkNow };
}

function CancelControl({ run }: { run: TrainingRun }) {
  const upsertRun = useLearningStore((state) => state.upsertRun);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const confirm = async () => {
    setBusy(true);
    setError(null);
    const result = await api.training.cancel(run.runId);
    setBusy(false);
    setConfirming(false);
    if (result.ok) upsertRun(result.data);
    else setError(result.error);
  };

  return (
    <div className={styles.cancel}>
      {error && <ConnectionNotice error={error} />}
      {canCancel(run) && !confirming && (
        <Button variant="secondary" onClick={() => setConfirming(true)}>
          Request training cancellation
        </Button>
      )}
      {canCancel(run) && confirming && (
        <>
          <p className={styles.warn}>
            A cancel request does not stop training or billing until the provider confirms it · the run may already be finished
          </p>
          <div className={styles.buttons}>
            <Button variant="secondary" onClick={() => void confirm()} disabled={busy}>
              {busy ? "Sending" : "Send cancel request"}
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(false)} disabled={busy}>
              Keep running
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

export function RunStatusView({ run, agent, onBack }: { run: TrainingRun; agent: AgentProfile | null; onBack: () => void }) {
  const { failure, checkNow } = useRunPolling(run);
  const copy = TRAINING_STATUS_COPY[run.status];
  const differentModel = agent?.selectedModel ? !isSameModel(agent.selectedModel, run.spec.baseModel) : false;

  return (
    <div className={styles.run} data-testid="run-status" data-status={run.status}>
      <Button variant="ghost" onClick={onBack}>
        Back to learning station
      </Button>

      <section className={styles.step} aria-label="Training status">
        <h3>Training status</h3>
        <StatusBadge tone={copy.tone}>{copy.label}</StatusBadge>
        <p>{copy.detail}</p>
        {run.statusReason && <p className={styles.help}>Reason: {run.statusReason}</p>}
        <dl className={styles.facts}>
          <div className={styles.fact}>
            <dt>Base model</dt>
            <dd>{run.spec.baseModel.modelId}</dd>
          </div>
          <div className={styles.fact}>
            <dt>Provider</dt>
            <dd>{run.spec.provider}</dd>
          </div>
          <div className={styles.fact}>
            <dt>Provider job ID</dt>
            <dd>{run.providerJobId ?? "Not yet"}</dd>
          </div>
          <div className={styles.fact}>
            <dt>Cost limit</dt>
            <dd>
              {run.spec.costLimit.amount.toLocaleString("en-US")} {run.spec.costLimit.currency}
            </dd>
          </div>
          <div className={styles.fact}>
            <dt>Last observed</dt>
            <dd>{formatDateTime(run.lastObservedAt)}</dd>
          </div>
        </dl>

        {(failure || run.pollError) && (
          <>
            <p className={styles.warn} role="status">
              Could not get the latest status · the details above are the last observed state and do not mean training failed
            </p>
            <ConnectionNotice error={(failure ?? run.pollError) as ApiError} />
            <Button variant="secondary" onClick={checkNow}>
              Check again now
            </Button>
          </>
        )}
        <CancelControl run={run} />
      </section>

      {differentModel && (
        <p className={styles.warn} role="status">
          This training is based on {run.spec.baseModel.modelId} · it is not automatically compatible with your current selection{" "}
          {agent?.selectedModel?.modelId}
        </p>
      )}

      <ResultLedger key={run.artifactId ?? run.runId} run={run} />
    </div>
  );
}
