"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/shared/api";
import type { ApiError, ModelPreparation, ModelReference } from "@/shared/contracts";
import { Button, ConnectionNotice, StatusBadge } from "@/shared/ui";
import { LOCATION_LABEL, PREPARATION_VIEW, formatDateTime } from "./presentation";
import styles from "./ModelPicker.module.css";

const POLL_MS = 3000;

/** Render with `key` set to the model: a status must never carry over to another model. */
export function ModelPreparationPanel({ model }: { model: ModelReference }) {
  const [preparation, setPreparation] = useState<ModelPreparation | null>(null);
  const [requestError, setRequestError] = useState<ApiError | null>(null);
  const [pollError, setPollError] = useState<ApiError | null>(null);
  const [pollTick, setPollTick] = useState(0);
  const [requesting, setRequesting] = useState(false);
  const requestController = useRef<AbortController | null>(null);

  useEffect(() => () => requestController.current?.abort(), []);

  const preparationId = preparation?.status === "preparing" ? preparation.preparationId : null;

  useEffect(() => {
    if (!preparationId) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void api.preparations.get(preparationId, controller.signal).then((result) => {
        if (controller.signal.aborted) return;
        if (result.ok) {
          setPollError(null);
          setPreparation(result.data);
          setPollTick((tick) => tick + 1);
          return;
        }
        // A failed status read says nothing about the preparation itself: keep the last known status.
        setPollError(result.error);
        if (result.error.retryable) setPollTick((tick) => tick + 1);
      });
    }, POLL_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [preparationId, pollTick]);

  const request = async () => {
    requestController.current?.abort();
    const controller = new AbortController();
    requestController.current = controller;
    setRequesting(true);
    setRequestError(null);
    const result = await api.preparations.create({ ref: model }, controller.signal);
    if (controller.signal.aborted) return;
    setRequesting(false);
    if (result.ok) setPreparation(result.data);
    else setRequestError(result.error);
  };

  const unsupported = model.capabilities.filesPreparable.support === "no";

  return (
    <div className={styles.preparation} data-testid="model-preparation">
      {preparation ? (
        <>
          <p className={styles.preparationLine}>
            모델 파일 <StatusBadge tone={PREPARATION_VIEW[preparation.status].tone}>{PREPARATION_VIEW[preparation.status].label}</StatusBadge>
            <span className={styles.muted}>{formatDateTime(preparation.updatedAt)} 기준</span>
          </p>
          {preparation.location && (
            <p className={styles.muted}>
              위치: {LOCATION_LABEL[preparation.location.kind]}
              {preparation.location.uri && ` · ${preparation.location.uri}`}
            </p>
          )}
          {preparation.statusReason && <p className={styles.muted}>{preparation.statusReason}</p>}
          {pollError && <p className={styles.muted}>최신 상태를 확인하지 못해 마지막으로 확인한 상태를 보여 줍니다.</p>}
        </>
      ) : unsupported ? (
        <p className={styles.muted}>이 모델은 파일 준비를 지원하지 않는 것으로 확인되었습니다.</p>
      ) : (
        <Button variant="secondary" disabled={requesting} onClick={() => void request()}>
          {requesting ? "요청 중" : "모델 파일 준비 요청"}
        </Button>
      )}
      {requestError && <ConnectionNotice error={requestError} onRetry={() => void request()} />}
    </div>
  );
}
