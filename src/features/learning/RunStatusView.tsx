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
          학습 취소 요청
        </Button>
      )}
      {canCancel(run) && confirming && (
        <>
          <p className={styles.warn}>
            취소를 요청해도 공급자가 확인하기 전까지 학습과 과금이 멈춘 것은 아닙니다. 이미 완료되었을 수도 있습니다.
          </p>
          <div className={styles.buttons}>
            <Button onClick={() => void confirm()} disabled={busy}>
              {busy ? "요청 중" : "취소 요청 보내기"}
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(false)} disabled={busy}>
              계속 진행
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
        학습 준비로 돌아가기
      </Button>

      <section className={styles.step} aria-label="학습 상태">
        <h3>학습 상태</h3>
        <StatusBadge tone={copy.tone}>{copy.label}</StatusBadge>
        <p>{copy.detail}</p>
        {run.statusReason && <p className={styles.help}>사유: {run.statusReason}</p>}
        <dl className={styles.facts}>
          <div className={styles.fact}>
            <dt>기반 모델</dt>
            <dd>{run.spec.baseModel.modelId}</dd>
          </div>
          <div className={styles.fact}>
            <dt>공급자</dt>
            <dd>{run.spec.provider}</dd>
          </div>
          <div className={styles.fact}>
            <dt>공급자 작업 ID</dt>
            <dd>{run.providerJobId ?? "아직 없음"}</dd>
          </div>
          <div className={styles.fact}>
            <dt>비용 한도</dt>
            <dd>
              {run.spec.costLimit.amount.toLocaleString("ko-KR")} {run.spec.costLimit.currency}
            </dd>
          </div>
          <div className={styles.fact}>
            <dt>마지막 관측</dt>
            <dd>{formatDateTime(run.lastObservedAt)}</dd>
          </div>
        </dl>

        {(failure || run.pollError) && (
          <>
            <p className={styles.warn} role="status">
              최신 상태를 가져오지 못했습니다. 위 내용은 마지막으로 관측한 상태이며, 학습 실패를 뜻하지 않습니다.
            </p>
            <ConnectionNotice error={(failure ?? run.pollError) as ApiError} />
            <Button variant="secondary" onClick={checkNow}>
              지금 다시 확인
            </Button>
          </>
        )}
        <CancelControl run={run} />
      </section>

      {differentModel && (
        <p className={styles.warn} role="status">
          이 학습의 기반은 {run.spec.baseModel.modelId}입니다. 현재 선택한 {agent?.selectedModel?.modelId}에는 자동으로 호환되지
          않습니다.
        </p>
      )}

      <ResultLedger key={run.artifactId ?? run.runId} run={run} />
    </div>
  );
}
