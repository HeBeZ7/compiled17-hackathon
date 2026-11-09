import type { BenchmarkScore, CatalogEntry } from "@/shared/contracts";
import { Button, StatusBadge } from "@/shared/ui";
import { CapabilityList } from "./CapabilityList";
import { formatDateTime, formatScore, isComparableScore } from "./presentation";
import styles from "./ModelPicker.module.css";

const MAX_TAGS = 5;

function Benchmarks({ scores }: { scores: BenchmarkScore[] }) {
  if (scores.length === 0) return <p className={styles.muted}>벤치마크 근거 없음</p>;
  return (
    <details className={styles.details}>
      <summary>벤치마크 {scores.length}건</summary>
      <ul className={styles.evidenceList}>
        {scores.map((score, index) => (
          <li key={`${score.benchmark}-${index}`}>
            <strong>{score.benchmark}</strong> {formatScore(score)}
            {score.task && ` · 과제 ${score.task}`}
            {score.dataset && ` · 평가셋 ${score.dataset}`}
            {score.conditions && ` · 조건 ${score.conditions}`}
            {score.checkedAt && ` · ${formatDateTime(score.checkedAt)} 확인`}
            {score.sourceUrl && (
              <>
                {" · "}
                <a href={score.sourceUrl} target="_blank" rel="noreferrer">
                  출처
                </a>
              </>
            )}
            {score.score !== null && !isComparableScore(score) && (
              <>
                {" "}
                <StatusBadge tone="unknown">조건 미확인 · 비교 불가</StatusBadge>
              </>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}

export function ModelCard({
  entry,
  selected,
  onSelect,
}: {
  entry: CatalogEntry;
  selected: boolean;
  onSelect: () => void;
}) {
  const { ref, displayName, tags, benchmarks } = entry;
  return (
    <article className={styles.card} data-selected={selected} data-model-id={ref.modelId}>
      <header>
        <h3 className={styles.cardTitle}>{displayName}</h3>
        <p className={styles.modelId}>{ref.modelId}</p>
      </header>
      <dl className={styles.facts}>
        <div>
          <dt>공급처</dt>
          <dd>
            {ref.source}
            {ref.publisher && ` · ${ref.publisher}`}
          </dd>
        </div>
        <div>
          <dt>버전</dt>
          <dd>{ref.revision ? <code>{ref.revision.slice(0, 12)}</code> : "미확인"}</dd>
        </div>
        <div>
          <dt>라이선스</dt>
          <dd>{ref.licenseRef ?? "미확인"}</dd>
        </div>
      </dl>
      {tags.length > 0 && (
        <ul className={styles.tags}>
          {tags.slice(0, MAX_TAGS).map((tag) => (
            <li key={tag}>{tag}</li>
          ))}
        </ul>
      )}
      <CapabilityList capabilities={ref.capabilities} />
      <Benchmarks scores={benchmarks} />
      <Button
        className={styles.selectButton}
        variant={selected ? "primary" : "secondary"}
        aria-pressed={selected}
        data-testid={`model-option-${ref.modelId}`}
        onClick={onSelect}
      >
        {selected ? "선택됨" : "이 모델 선택"}
      </Button>
    </article>
  );
}
