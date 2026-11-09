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
            Model files <StatusBadge tone={PREPARATION_VIEW[preparation.status].tone}>{PREPARATION_VIEW[preparation.status].label}</StatusBadge>
            <span className={styles.muted}>As of {formatDateTime(preparation.updatedAt)}</span>
          </p>
          {preparation.location && (
            <p className={styles.muted}>
              Location: {LOCATION_LABEL[preparation.location.kind]}
              {preparation.location.uri && ` · ${preparation.location.uri}`}
            </p>
          )}
          {preparation.statusReason && <p className={styles.muted}>{preparation.statusReason}</p>}
          {pollError && <p className={styles.muted}>Could not get the latest state  Showing the last confirmed state</p>}
        </>
      ) : unsupported ? (
        <p className={styles.muted}>File preparation is confirmed as unsupported for this model</p>
      ) : (
        <Button variant="secondary" disabled={requesting} onClick={() => void request()}>
          {requesting ? "Requesting" : "Request model file preparation"}
        </Button>
      )}
      {requestError && <ConnectionNotice error={requestError} onRetry={() => void request()} />}
    </div>
  );
}
