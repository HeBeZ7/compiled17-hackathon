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
  lora_adapter: "LoRA 어댑터",
  full_weights: "전체 가중치",
  unknown: "종류 미확인",
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
        <span>결과 모델에게 시험 질문</span>
        <textarea rows={2} value={prompt} onChange={(event) => setPrompt(event.target.value)} />
      </label>
      <Button type="submit" variant="secondary" disabled={!prompt.trim() || busy}>
        {busy ? "응답 기다리는 중" : "실제 응답 확인"}
      </Button>
      {error && <ConnectionNotice error={error} />}
      {response && (
        <div className={styles.inferenceResult}>
          <span className={styles.badges}>
            <ConnectionBadge state={response.connection} />
            <span className={styles.help}>{formatDateTime(response.respondedAt)}</span>
          </span>
          <p className={styles.text}>{response.text}</p>
          <p className={styles.help}>이 응답 하나로 성능 향상을 판단할 수 없습니다.</p>
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
    <section className={styles.ledger} aria-label="결과 상태">
      <h3>결과 상태</h3>
      <Row title="학습" copy={describeTrainingOutcome(run)} />

      <Row title="결과물" copy={describeArtifact(artifactData, artifactId)}>
        {artifact.state === "error" && <ConnectionNotice error={artifact.error} />}
        {artifactData && (
          <p className={styles.help}>
            {ARTIFACT_KIND[artifactData.kind]} · 기반 모델 {artifactData.baseModel.modelId} 전용
          </p>
        )}
      </Row>

      {artifactId && (
        <Row title="실제 사용" copy={describeRuntime(runtimeData)}>
          {runtime.state === "error" && <ConnectionNotice error={runtime.error} />}
          {runtimeData?.error && <ConnectionNotice error={runtimeData.error} />}
          {loadError && <ConnectionNotice error={loadError} />}
          {canLoad && (
            <Button variant="secondary" onClick={() => void load()}>
              결과 모델 불러오기
            </Button>
          )}
          {runtimeData?.state === "loaded" && (
            <InferenceCheck artifactId={artifactId} onDone={() => setRefreshTick((tick) => tick + 1)} />
          )}
        </Row>
      )}

      <Row
        title="성능 평가"
        copy={
          run.evaluationResult
            ? { tone: "ok", label: "평가 있음", detail: run.evaluationResult.summary }
            : { tone: "unknown", label: "평가 없음", detail: "학습 완료가 성능 향상을 뜻하지는 않습니다." }
        }
      >
        {run.evaluationResult && (
          <p className={styles.help}>
            평가 자료 {run.evaluationResult.evalDatasetId} · {formatDateTime(run.evaluationResult.evaluatedAt)}
          </p>
        )}
      </Row>
    </section>
  );
}
