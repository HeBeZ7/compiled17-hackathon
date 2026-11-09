"use client";

import { useEffect } from "react";
import { ModelSummary } from "@/features/teacher/ModelSummary";
import { useDialogBehavior } from "@/features/teacher/useDialogBehavior";
import { formatDateTime } from "@/features/teacher/format";
import { fail, type LearningPanelProps, type TrainingRun } from "@/shared/contracts";
import { Button, ButtonLink, ConnectionNotice, Panel, StatusBadge } from "@/shared/ui";
import { TRAINING_STATUS_COPY } from "./learningLogic";
import styles from "./LearningPanel.module.css";
import { selectAgentRuns, useLearningStore } from "./learningStore";
import { PreparationSteps } from "./PreparationSteps";
import { RunStatusView } from "./RunStatusView";

const AGENT_REQUIRED = fail("BLOCKED", "에이전트 필요: 학습을 준비하려면 먼저 에이전트를 만들어 주세요.").error;
const MODEL_REQUIRED = fail("BLOCKED", "학생 모델 필요: 학습할 모델을 먼저 선택해 주세요.").error;

function PendingRequestNotice() {
  const { pending, pendingCheck, submitting, submitError, recheckPending, resendPending, discardPending } = useLearningStore();
  if (!pending) return null;
  return (
    <section className={styles.pending} aria-label="결과를 확인하지 못한 요청" data-testid="pending-request">
      <StatusBadge tone="unknown">요청 결과 불명</StatusBadge>
      <p>
        {formatDateTime(pending.savedAt)}에 보낸 학습 요청의 결과를 아직 확인하지 못했습니다. 실패로 단정하지 않으며, 중복
        실행을 막기 위해 자동으로 다시 보내지 않습니다.
      </p>
      {submitError && <ConnectionNotice error={submitError} />}
      {pendingCheck.state === "loading" && <p role="status">서버 기록을 확인하는 중입니다.</p>}
      {pendingCheck.state === "error" && <ConnectionNotice error={pendingCheck.error} />}
      {pendingCheck.state === "ready" && <p className={styles.help}>서버에는 이 요청의 기록이 없습니다.</p>}
      <div className={styles.buttons}>
        <Button variant="secondary" onClick={() => void recheckPending()} disabled={submitting || pendingCheck.state === "loading"}>
          기존 요청 다시 확인
        </Button>
        {pendingCheck.state === "ready" && (
          <>
            <Button variant="secondary" onClick={() => void resendPending()} disabled={submitting}>
              같은 요청 번호로 다시 보내기
            </Button>
            <Button variant="ghost" onClick={discardPending} disabled={submitting}>
              이 요청 기록 지우기
            </Button>
          </>
        )}
      </div>
      {pendingCheck.state === "ready" && (
        <p className={styles.help}>기록을 지우고 새로 요청하면, 이전 요청이 공급자에 도달했던 경우 비용이 두 번 발생할 수 있습니다.</p>
      )}
    </section>
  );
}

function RunHistory({ runs, onSelect }: { runs: TrainingRun[]; onSelect: (runId: string) => void }) {
  if (runs.length === 0) return null;
  return (
    <section className={styles.step} aria-label="내 학습 기록">
      <h3>내 학습 기록</h3>
      <ul className={styles.history}>
        {runs.map((run) => {
          const copy = TRAINING_STATUS_COPY[run.status];
          return (
            <li key={run.runId}>
              <button type="button" className={styles.historyItem} onClick={() => onSelect(run.runId)}>
                <span className={styles.modelName}>{run.spec.baseModel.modelId}</span>
                <span className={styles.help}>{formatDateTime(run.createdAt)}</span>
                <StatusBadge tone={copy.tone}>{copy.label}</StatusBadge>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function LearningPanel({ agent, onClose }: LearningPanelProps) {
  const state = useLearningStore();
  const { open, selectRun, runsLoad, refreshRuns } = state;
  const dialogRef = useDialogBehavior(onClose);
  const runs = selectAgentRuns(state);
  const selected = runs.find((run) => run.runId === state.selectedRunId) ?? null;

  useEffect(() => open(agent), [agent, open]);

  return (
    <div ref={dialogRef} className={styles.shell} role="dialog" aria-modal="true" aria-label="학습 준비">
      <Panel className={styles.panel}>
        <div className={styles.head}>
          <h2 tabIndex={-1} data-dialog-title>
            학습 준비
          </h2>
          <Button variant="ghost" onClick={onClose}>
            닫기
          </Button>
        </div>

        <div className={styles.scroll}>
          {!agent ? (
            <>
              <ConnectionNotice error={AGENT_REQUIRED} />
              <ButtonLink href="/create" variant="secondary">
                에이전트 만들기
              </ButtonLink>
            </>
          ) : selected ? (
            <RunStatusView run={selected} agent={agent} onBack={() => selectRun(null)} />
          ) : (
            <>
              <ModelSummary model={agent.selectedModel} />
              <PendingRequestNotice />
              {runsLoad.state === "error" && <ConnectionNotice error={runsLoad.error} onRetry={() => void refreshRuns()} />}
              {agent.selectedModel ? <PreparationSteps /> : <ConnectionNotice error={MODEL_REQUIRED} />}
              <RunHistory runs={runs} onSelect={selectRun} />
            </>
          )}
        </div>
      </Panel>
    </div>
  );
}
