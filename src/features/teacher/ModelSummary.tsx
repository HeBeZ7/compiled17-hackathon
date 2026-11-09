import type { ModelReference, SupportLevel } from "@/shared/contracts";
import { StatusBadge, type StatusTone } from "@/shared/ui";
import { EVIDENCE_LABEL } from "./format";
import styles from "./TeacherPanel.module.css";

const TRAINING_BADGE: Record<SupportLevel, { tone: StatusTone; label: string }> = {
  yes: { tone: "ok", label: "학습 지원 근거 있음" },
  no: { tone: "danger", label: "학습 미지원" },
  unknown: { tone: "unknown", label: "학습 지원 미확인" },
};

/** The user's student model, as stored on the profile. Unverified fields say so instead of being hidden. */
export function ModelSummary({ model }: { model: ModelReference | null }) {
  if (!model) {
    return (
      <div className={styles.model}>
        <span className={styles.caption}>학생 모델</span>
        <strong>아직 선택하지 않았습니다</strong>
      </div>
    );
  }
  const training = model.capabilities.training;
  const badge = TRAINING_BADGE[training.support];
  return (
    <div className={styles.model}>
      <span className={styles.caption}>학생 모델</span>
      <strong className={styles.modelId}>{model.modelId}</strong>
      <span className={styles.meta}>
        공급처 {model.publisher ?? model.source} · 버전 {model.revision ?? "미확인"} · 라이선스 {model.licenseRef ?? "미확인"}
      </span>
      <span className={styles.badges}>
        <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
        {training.evidence && <StatusBadge tone="unknown">{EVIDENCE_LABEL[training.evidence.level]}</StatusBadge>}
      </span>
    </div>
  );
}
