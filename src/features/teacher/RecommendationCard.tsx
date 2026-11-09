import type { Evidence, TeacherRecommendation } from "@/shared/contracts";
import { ButtonLink, StatusBadge } from "@/shared/ui";
import { EVIDENCE_LABEL, formatDateTime, safeHttpUrl } from "./format";
import styles from "./TeacherPanel.module.css";

const KIND_LABEL: Record<TeacherRecommendation["kind"], string> = {
  keep_model: "Keep current model",
  consider_alternative: "Consider an alternative",
  training_direction: "Training direction",
  need_more_info: "More information needed",
};

function EvidenceItem({ evidence }: { evidence: Evidence }) {
  const href = safeHttpUrl(evidence.sourceUrl);
  return (
    <li className={styles.evidence}>
      <StatusBadge tone={evidence.level === "ASSISTANT_PROPOSED" || evidence.level === "UNKNOWN" ? "unknown" : "ok"}>
        {EVIDENCE_LABEL[evidence.level]}
      </StatusBadge>
      {evidence.note && <span>{evidence.note}</span>}
      <span className={styles.meta}>
        Checked {formatDateTime(evidence.checkedAt)}
        {href && (
          <>
            {" · "}
            <a href={href} target="_blank" rel="noreferrer noopener">
              View source
            </a>
          </>
        )}
      </span>
    </li>
  );
}

export function RecommendationCard({ item }: { item: TeacherRecommendation }) {
  return (
    <section className={styles.recommendation} aria-label={KIND_LABEL[item.kind]}>
      <h3>{KIND_LABEL[item.kind]}</h3>
      <p>{item.summary}</p>

      {item.alternativeModel && (
        <div className={styles.alternative}>
          <span className={styles.modelId}>{item.alternativeModel.modelId}</span>
          <span className={styles.meta}>Suggestion only · your model does not change automatically</span>
          <ButtonLink href="/create" variant="secondary">
            Change it yourself in model selection
          </ButtonLink>
        </div>
      )}

      {item.evidence.length > 0 ? (
        <ul className={styles.evidenceList} aria-label="Evidence">
          {item.evidence.map((evidence, index) => (
            <EvidenceItem key={index} evidence={evidence} />
          ))}
        </ul>
      ) : (
        <p className={styles.meta}>No verified evidence</p>
      )}

      {item.limitations && <p className={styles.limit}>Limits: {item.limitations}</p>}
    </section>
  );
}
