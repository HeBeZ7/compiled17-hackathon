"use client";

import type { ModelReference } from "@/shared/contracts";
import { Button, StatusBadge } from "@/shared/ui";
import { CapabilityList } from "./CapabilityList";
import { ModelPreparationPanel } from "./ModelPreparationPanel";
import styles from "./ModelPicker.module.css";

/** How far the shown capabilities of a saved selection could be re-checked. */
export type SelectionCheck = "not_saved" | "checking" | "current" | "saved_snapshot";

const CHECK_NOTE: Record<Exclude<SelectionCheck, "not_saved">, string> = {
  checking: "Checking the catalog for the latest state",
  current: "Just re-checked against the catalog",
  saved_snapshot: "Saved details  Could not re-check the catalog just now",
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
    <section className={styles.selected} aria-label="Selected model" data-testid="selected-model">
      <div className={styles.selectedHead}>
        <div>
          <StatusBadge tone="ok">Your agent&apos;s model</StatusBadge>
          <h3 className={styles.cardTitle}>{model.modelId}</h3>
          <p className={styles.muted}>
            {model.source} · Revision {model.revision ? model.revision.slice(0, 12) : "unverified"}
          </p>
        </div>
        <Button variant="ghost" onClick={onClear}>
          Clear selection
        </Button>
      </div>
      {check !== "not_saved" && <p className={styles.muted}>{CHECK_NOTE[check]}</p>}
      <CapabilityList capabilities={model.capabilities} />
      <ModelPreparationPanel key={key} model={model} />
    </section>
  );
}
