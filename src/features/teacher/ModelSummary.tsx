import type { ModelReference, SupportLevel } from "@/shared/contracts";
import { StatusBadge, type StatusTone } from "@/shared/ui";
import { EVIDENCE_LABEL } from "./format";
import styles from "./TeacherPanel.module.css";

const TRAINING_BADGE: Record<SupportLevel, { tone: StatusTone; label: string }> = {
  yes: { tone: "ok", label: "Training support on record" },
  no: { tone: "danger", label: "Training not supported" },
  unknown: { tone: "unknown", label: "Training support unknown" },
};

/** The user's student model, as stored on the profile. Unverified fields say so instead of being hidden. */
export function ModelSummary({ model }: { model: ModelReference | null }) {
  if (!model) {
    return (
      <div className={styles.model}>
        <span className={styles.caption}>Student model</span>
        <strong>Not selected yet</strong>
      </div>
    );
  }
  const training = model.capabilities.training;
  const badge = TRAINING_BADGE[training.support];
  return (
    <div className={styles.model}>
      <span className={styles.caption}>Student model</span>
      <strong className={styles.modelId}>{model.modelId}</strong>
      <span className={styles.meta}>
        Publisher {model.publisher ?? model.source} · Revision {model.revision ?? "Unknown"} · License {model.licenseRef ?? "Unknown"}
      </span>
      <span className={styles.badges}>
        <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
        {training.evidence && <StatusBadge tone="unknown">{EVIDENCE_LABEL[training.evidence.level]}</StatusBadge>}
      </span>
    </div>
  );
}
