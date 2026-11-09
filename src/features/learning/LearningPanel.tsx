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

const AGENT_REQUIRED = fail("BLOCKED", "Agent needed: create an agent before preparing training").error;
const MODEL_REQUIRED = fail("BLOCKED", "Student model needed: choose a model to train first").error;

function PendingRequestNotice() {
  const { pending, pendingCheck, submitting, submitError, recheckPending, resendPending, discardPending } = useLearningStore();
  if (!pending) return null;
  return (
    <section className={styles.pending} aria-label="Request with unknown outcome" data-testid="pending-request">
      <StatusBadge tone="unknown">Outcome unknown</StatusBadge>
      <p>
        The training request sent at {formatDateTime(pending.savedAt)} has no confirmed outcome yet · it is not treated as failed
        and is never resent automatically, to avoid a duplicate run
      </p>
      {submitError && <ConnectionNotice error={submitError} />}
      {pendingCheck.state === "loading" && <p role="status">Checking server records</p>}
      {pendingCheck.state === "error" && <ConnectionNotice error={pendingCheck.error} />}
      {pendingCheck.state === "ready" && <p className={styles.help}>The server has no record of this request</p>}
      <div className={styles.buttons}>
        <Button variant="secondary" onClick={() => void recheckPending()} disabled={submitting || pendingCheck.state === "loading"}>
          Check existing request again
        </Button>
        {pendingCheck.state === "ready" && (
          <>
            <Button variant="secondary" onClick={() => void resendPending()} disabled={submitting}>
              Resend with the same request key
            </Button>
            <Button variant="ghost" onClick={discardPending} disabled={submitting}>
              Delete this request record
            </Button>
          </>
        )}
      </div>
      {pendingCheck.state === "ready" && (
        <p className={styles.help}>If you delete this record and request again, you may be charged twice if the earlier request reached the provider</p>
      )}
    </section>
  );
}

function RunHistory({ runs, onSelect }: { runs: TrainingRun[]; onSelect: (runId: string) => void }) {
  if (runs.length === 0) return null;
  return (
    <section className={styles.step} aria-label="My training runs">
      <h3>My training runs</h3>
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
    <div ref={dialogRef} className={styles.shell} role="dialog" aria-modal="true" aria-label="Learning station">
      <Panel className={styles.panel}>
        <div className={styles.head}>
          <h2 tabIndex={-1} data-dialog-title>
            Learning station
          </h2>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>

        <div className={styles.scroll}>
          {!agent ? (
            <>
              <ConnectionNotice error={AGENT_REQUIRED} />
              <ButtonLink href="/create" variant="secondary">
                Create an agent
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
