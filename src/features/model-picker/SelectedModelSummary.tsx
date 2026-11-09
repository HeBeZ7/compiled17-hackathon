"use client";

import type { ModelReference } from "@/shared/contracts";
import { Button, StatusBadge } from "@/shared/ui";
import { CapabilityList } from "./CapabilityList";
import { ModelPreparationPanel } from "./ModelPreparationPanel";
import styles from "./ModelPicker.module.css";

/** How far the shown capabilities of a saved selection could be re-checked. */
export type SelectionCheck = "not_saved" | "checking" | "current" | "saved_snapshot";

const CHECK_NOTE: Record<Exclude<SelectionCheck, "not_saved">, string> = {
  checking: "카탈로그에서 최신 상태를 확인하고 있습니다.",
  current: "카탈로그에서 방금 다시 확인한 상태입니다.",
  saved_snapshot: "저장할 때의 정보입니다. 지금 카탈로그에서 다시 확인하지 못했습니다.",
};

export function SelectedModelSummary({
  model,
  check,
  onClear,
}: {
  model: ModelReference;
  check: SelectionCheck;
  onClear: () => void;
}) {
  const key = `${model.source}|${model.modelId}|${model.revision ?? ""}`;
  return (
    <section className={styles.selected} aria-label="선택한 모델" data-testid="selected-model">
      <div className={styles.selectedHead}>
        <div>
          <StatusBadge tone="ok">내 에이전트의 모델</StatusBadge>
          <h3 className={styles.cardTitle}>{model.modelId}</h3>
          <p className={styles.muted}>
            {model.source} · 버전 {model.revision ? model.revision.slice(0, 12) : "미확인"}
          </p>
        </div>
        <Button variant="ghost" onClick={onClear}>
          선택 해제
        </Button>
      </div>
      {check !== "not_saved" && <p className={styles.muted}>{CHECK_NOTE[check]}</p>}
      <CapabilityList capabilities={model.capabilities} />
      <ModelPreparationPanel key={key} model={model} />
    </section>
  );
}
