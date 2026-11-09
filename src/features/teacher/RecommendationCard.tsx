import type { Evidence, TeacherRecommendation } from "@/shared/contracts";
import { ButtonLink, StatusBadge } from "@/shared/ui";
import { EVIDENCE_LABEL, formatDateTime, safeHttpUrl } from "./format";
import styles from "./TeacherPanel.module.css";

const KIND_LABEL: Record<TeacherRecommendation["kind"], string> = {
  keep_model: "현재 모델 유지",
  consider_alternative: "대안 모델 검토",
  training_direction: "교육 방향",
  need_more_info: "추가 확인 필요",
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
        확인 {formatDateTime(evidence.checkedAt)}
        {href && (
          <>
            {" · "}
            <a href={href} target="_blank" rel="noreferrer noopener">
              출처 보기
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
          <span className={styles.meta}>제안일 뿐이며 내 모델은 자동으로 바뀌지 않습니다.</span>
          <ButtonLink href="/create" variant="secondary">
            모델 선택에서 직접 바꾸기
          </ButtonLink>
        </div>
      )}

      {item.evidence.length > 0 ? (
        <ul className={styles.evidenceList} aria-label="근거">
          {item.evidence.map((evidence, index) => (
            <EvidenceItem key={index} evidence={evidence} />
          ))}
        </ul>
      ) : (
        <p className={styles.meta}>확인된 근거 없음</p>
      )}

      {item.limitations && <p className={styles.limit}>한계: {item.limitations}</p>}
    </section>
  );
}
