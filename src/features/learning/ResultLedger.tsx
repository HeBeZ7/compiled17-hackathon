"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { formatDateTime } from "@/features/teacher/format";
import { api } from "@/shared/api";
import type { ApiError, InferenceResponse, ModelArtifact, RuntimeStatus, TrainingRun } from "@/shared/contracts";
import { Button, ConnectionBadge, ConnectionNotice, StatusBadge } from "@/shared/ui";
import { describeArtifact, describeRuntime, describeTrainingOutcome, type StatusCopy } from "./learningLogic";
import styles from "./LearningPanel.module.css";
import type { Remote } from "./learningStore";

const RUNTIME_POLL_MS = 5_000;

const ARTIFACT_KIND: Record<ModelArtifact["kind"], string> = {
  lora_adapter: "LoRA adapter",
  full_weights: "Full weights",
  unknown: "Kind unknown",
};

function Row({ title, copy, children }: { title: string; copy: StatusCopy; children?: ReactNode }) {
  return (
    <div className={styles.ledgerRow}>
      <div className={styles.ledgerHead}>
        <strong>{title}</strong>
        <StatusBadge tone={copy.tone}>{copy.label}</StatusBadge>
      </div>
      <p className={styles.help}>{copy.detail}</p>
      {children}
    </div>
  );
}

function InferenceCheck({ artifactId, onDone }: { artifactId: string; onDone: () => void }) {
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [response, setResponse] = useState<InferenceResponse | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  const run = async (event: FormEvent) => {
    event.preventDefault();
    if (!prompt.trim() || busy) return;
    setBusy(true);
    setError(null);
    const result = await api.inference.run({ artifactId, messages: [{ role: "user", content: prompt.trim() }] });
    setBusy(false);
    if (result.ok) {
      setResponse(result.data);
      onDone();
    } else {
      setError(result.error);
    }
  };

  return (
    <form className={styles.inference} onSubmit={run}>
      <label className={styles.field}>
        <span>Test question for the result model</span>
        <textarea rows={2} value={prompt} onChange={(event) => setPrompt(event.target.value)} />
      </label>
      <Button type="submit" variant="secondary" disabled={!prompt.trim() || busy}>
        {busy ? "Waiting for a reply" : "Check real response"}
      </Button>
      {error && <ConnectionNotice error={error} />}
      {response && (
        <div className={styles.inferenceResult}>
          <span className={styles.badges}>
            <ConnectionBadge state={response.connection} />
            <span className={styles.help}>{formatDateTime(response.respondedAt)}</span>
          </span>
          <p className={styles.text}>{response.text}</p>
          <p className={styles.help}>One response cannot show whether performance improved</p>
        </div>
      )}
    </form>
  );
}

/** Four independent facts. One being good says nothing about the next. */
export function ResultLedger({ run }: { run: TrainingRun }) {
  const artifactId = run.artifactId;
  const [artifact, setArtifact] = useState<Remote<ModelArtifact>>(artifactId ? { state: "loading" } : { state: "idle" });
  const [runtime, setRuntime] = useState<Remote<RuntimeStatus>>(artifactId ? { state: "loading" } : { state: "idle" });
  const [loadError, setLoadError] = useState<ApiError | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    if (!artifactId) return;
    const controller = new AbortController();
    void Promise.all([api.artifacts.get(artifactId, controller.signal), api.artifacts.runtime(artifactId, controller.signal)]).then(
      ([artifactResult, runtimeResult]) => {
        if (controller.signal.aborted) return;
        setArtifact(artifactResult.ok ? { state: "ready", data: artifactResult.data } : { state: "error", error: artifactResult.error });
        setRuntime(runtimeResult.ok ? { state: "ready", data: runtimeResult.data } : { state: "error", error: runtimeResult.error });
      },
    );
    return () => controller.abort();
  }, [artifactId, refreshTick]);

  const runtimeState = runtime.state === "ready" ? runtime.data.state : null;
  useEffect(() => {
    if (!artifactId || runtimeState !== "loading") return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void api.artifacts.runtime(artifactId, controller.signal).then((result) => {
        if (controller.signal.aborted) return;
        if (result.ok) setRuntime({ state: "ready", data: result.data });
        else setRuntime({ state: "error", error: result.error });
      });
    }, RUNTIME_POLL_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [artifactId, runtimeState, runtime]);

  const load = async () => {
    if (!artifactId) return;
    setLoadError(null);
    setRuntime({ state: "loading" });
    const result = await api.artifacts.load(artifactId);
    if (result.ok) {
      setRuntime({ state: "ready", data: result.data });
    } else {
      setLoadError(result.error);
      setRefreshTick((tick) => tick + 1);
    }
  };

  const artifactData = artifact.state === "ready" ? artifact.data : null;
  const runtimeData = runtime.state === "ready" ? runtime.data : null;
  const canLoad =
    artifactData?.existenceVerified === true &&
    (runtimeData?.state === "not_loaded" || runtimeData?.state === "load_failed" || runtimeData?.state === "unknown");

  return (
    <section className={styles.ledger} aria-label="Result status">
      <h3>Result status</h3>
      <Row title="Training" copy={describeTrainingOutcome(run)} />

      <Row title="Artifact" copy={describeArtifact(artifactData, artifactId)}>
        {artifact.state === "error" && <ConnectionNotice error={artifact.error} />}
        {artifactData && (
          <p className={styles.help}>
            {ARTIFACT_KIND[artifactData.kind]} · only for base model {artifactData.baseModel.modelId}
          </p>
        )}
      </Row>

      {artifactId && (
        <Row title="Real use" copy={describeRuntime(runtimeData)}>
          {runtime.state === "error" && <ConnectionNotice error={runtime.error} />}
          {runtimeData?.error && <ConnectionNotice error={runtimeData.error} />}
          {loadError && <ConnectionNotice error={loadError} />}
          {canLoad && (
            <Button variant="secondary" onClick={() => void load()}>
              Load result model
            </Button>
          )}
          {runtimeData?.state === "loaded" && (
            <InferenceCheck artifactId={artifactId} onDone={() => setRefreshTick((tick) => tick + 1)} />
          )}
        </Row>
      )}

      <Row
        title="Performance evaluation"
        copy={
          run.evaluationResult
            ? { tone: "ok", label: "Evaluation available", detail: run.evaluationResult.summary }
            : { tone: "unknown", label: "No evaluation", detail: "Completed training does not mean improved performance" }
        }
      >
        {run.evaluationResult && (
          <p className={styles.help}>
            Evaluation data {run.evaluationResult.evalDatasetId} · {formatDateTime(run.evaluationResult.evaluatedAt)}
          </p>
        )}
      </Row>
    </section>
  );
}
