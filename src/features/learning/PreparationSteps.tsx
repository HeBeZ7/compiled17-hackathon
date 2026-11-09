"use client";

import type { ChangeEvent, ReactNode } from "react";
import { safeHttpUrl, formatDateTime } from "@/features/teacher/format";
import { TrainingMethod, type PriceQuote, type TrainingDataset } from "@/shared/contracts";
import { Button, ConnectionNotice, StatusBadge, type StatusTone } from "@/shared/ui";
import {
  FRESHNESS_LABEL,
  activeRun as findActiveRun,
  buildTrainingSpec,
  formatAmount,
  isPriceKnown,
  limitBelowEstimate,
  normalizeCurrency,
  parsePositive,
  submitBlockers,
} from "./learningLogic";
import styles from "./LearningPanel.module.css";
import { remoteData, selectAgentRuns, useLearningStore } from "./learningStore";

const METHOD_LABEL: Record<TrainingMethod, string> = {
  lora: "LoRA 어댑터",
  qlora: "QLoRA 어댑터",
  full: "전체 파라미터",
};

const DATASET_BADGE: Record<TrainingDataset["validation"], { tone: StatusTone; label: string }> = {
  pending: { tone: "unknown", label: "검증 대기" },
  valid: { tone: "ok", label: "검증 통과" },
  invalid: { tone: "danger", label: "검증 실패" },
  unknown: { tone: "unknown", label: "검증 미확인" },
};

function Step({ title, testId, children }: { title: string; testId?: string; children: ReactNode }) {
  return (
    <section className={styles.step} aria-label={title} data-testid={testId}>
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.fact}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function DatasetStep() {
  const { dataset, uploadDataset } = useLearningStore();
  const data = remoteData(dataset);

  const onFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void uploadDataset(file);
  };

  return (
    <Step title="1. 학습 자료">
      <p className={styles.help}>
        GPU 학습에는 준비된 자료 파일이 필요합니다. 선생님에게 설명한 목표만으로는 학습 자료가 되지 않습니다.
      </p>
      <label className={styles.field}>
        <span>자료 파일</span>
        <input type="file" onChange={onFile} disabled={dataset.state === "loading"} />
      </label>
      {dataset.state === "loading" && <p role="status">자료를 저장하는 중입니다.</p>}
      {dataset.state === "error" && <ConnectionNotice error={dataset.error} />}
      {data && (
        <dl className={styles.facts}>
          <Fact label="저장된 파일">{data.fileName}</Fact>
          <Fact label="크기">{data.sizeBytes.toLocaleString("ko-KR")} 바이트</Fact>
          <Fact label="검증">
            <StatusBadge tone={DATASET_BADGE[data.validation].tone}>{DATASET_BADGE[data.validation].label}</StatusBadge>
          </Fact>
          <Fact label="형식">{data.format ?? "미확인"}</Fact>
          <Fact label="예시 수">{data.exampleCount ?? "미확인"}</Fact>
        </dl>
      )}
      {data && data.issues.length > 0 && (
        <ul className={styles.issues}>
          {data.issues.map((issue, index) => (
            <li key={index}>{issue}</li>
          ))}
        </ul>
      )}
    </Step>
  );
}

function MethodStep() {
  const { method, hours, setMethod, setHours } = useLearningStore();
  const hoursInvalid = hours.trim() !== "" && parsePositive(hours) === null;
  return (
    <Step title="2. 학습 방식">
      <label className={styles.field}>
        <span>방식</span>
        <select
          value={method ?? ""}
          onChange={(event) => {
            const parsed = TrainingMethod.safeParse(event.target.value);
            setMethod(parsed.success ? parsed.data : null);
          }}
        >
          <option value="">골라 주세요</option>
          {TrainingMethod.options.map((option) => (
            <option key={option} value={option}>
              {METHOD_LABEL[option]}
            </option>
          ))}
        </select>
      </label>
      <p className={styles.help}>이 모델과 방식이 실제로 가능한지는 아래 서버 조건 확인에서 판정합니다.</p>
      <label className={styles.field}>
        <span>예상 학습 시간 (선택, 시간)</span>
        <input type="text" inputMode="decimal" value={hours} onChange={(event) => setHours(event.target.value)} />
      </label>
      {hoursInvalid && <p className={styles.warn}>0보다 큰 숫자로 입력해 주세요.</p>}
    </Step>
  );
}

function QuoteDetails({ quote }: { quote: PriceQuote }) {
  const known = isPriceKnown(quote);
  const source = safeHttpUrl(quote.sourceUrl);
  return (
    <>
      {!known && (
        <p className={styles.warn} role="status">
          가격을 확인하지 못했습니다. 무료라는 뜻이 아닙니다.
        </p>
      )}
      <dl className={styles.facts}>
        <Fact label="공급자">{quote.provider}</Fact>
        <Fact label="지역">{quote.region ?? "미확인"}</Fact>
        <Fact label="GPU">{quote.gpuType ?? "미확인"}</Fact>
        <Fact label="단가">
          {formatAmount(quote.unitPrice, quote.currency)}
          {quote.unit ? ` / ${quote.unit}` : " (단위 미확인)"}
        </Fact>
        <Fact label="총액 추정">
          {formatAmount(quote.estimatedTotal, quote.currency)}
          {quote.estimatedTotal !== null && " · 추정치이며 실제 청구액과 다를 수 있음"}
        </Fact>
        <Fact label="값의 출처">
          {FRESHNESS_LABEL[quote.freshness]}
          {quote.cachedAt && ` (저장 ${formatDateTime(quote.cachedAt)})`}
        </Fact>
        <Fact label="조회 시각">{formatDateTime(quote.queriedAt)}</Fact>
        <Fact label="제외 비용">{quote.excludedCosts.length ? quote.excludedCosts.join(", ") : "공급자 정보 없음"}</Fact>
        {source && (
          <Fact label="출처">
            <a href={source} target="_blank" rel="noreferrer noopener">
              가격 출처 보기
            </a>
          </Fact>
        )}
      </dl>
      {quote.notes && <p className={styles.help}>{quote.notes}</p>}
    </>
  );
}

function PriceStep() {
  const { agent, quote, requestQuote } = useLearningStore();
  return (
    <Step title="3. 가격 확인" testId="price-panel">
      <Button variant="secondary" onClick={() => void requestQuote()} disabled={!agent?.selectedModel || quote.state === "loading"}>
        {quote.state === "loading" ? "조회 중" : quote.state === "ready" ? "가격 다시 조회" : "가격 조회"}
      </Button>
      {quote.state === "error" && <ConnectionNotice error={quote.error} />}
      {quote.state === "ready" && <QuoteDetails quote={quote.data} />}
    </Step>
  );
}

function LimitAndValidateStep() {
  const state = useLearningStore();
  const { quote, limitCurrency, limitAmount, setLimit, validate, validation } = state;
  const spec = buildTrainingSpec({
    agent: state.agent,
    dataset: remoteData(state.dataset),
    method: state.method,
    quote: remoteData(quote),
    limitCurrency,
    limitAmount,
  });
  const result = remoteData(validation);
  const currencyInvalid = limitCurrency.trim() !== "" && normalizeCurrency(limitCurrency) === null;
  const amountInvalid = limitAmount.trim() !== "" && parsePositive(limitAmount) === null;

  return (
    <Step title="4. 비용 한도와 조건 확인">
      <div className={styles.row}>
        <label className={styles.field}>
          <span>통화 (예: USD)</span>
          <input type="text" maxLength={3} value={limitCurrency} onChange={(event) => setLimit({ currency: event.target.value })} />
        </label>
        <label className={styles.field}>
          <span>실행 비용 한도</span>
          <input type="text" inputMode="decimal" value={limitAmount} onChange={(event) => setLimit({ amount: event.target.value })} />
        </label>
      </div>
      {currencyInvalid && <p className={styles.warn}>통화는 세 글자 코드로 입력해 주세요.</p>}
      {amountInvalid && <p className={styles.warn}>한도는 0보다 큰 숫자로 입력해 주세요.</p>}
      {limitBelowEstimate(remoteData(quote), limitCurrency, limitAmount) && (
        <p className={styles.warn}>입력한 한도가 총액 추정보다 낮습니다.</p>
      )}
      <Button variant="secondary" onClick={() => void validate()} disabled={!spec || validation.state === "loading"}>
        {validation.state === "loading" ? "확인 중" : "서버에서 조건 확인"}
      </Button>
      {validation.state === "error" && <ConnectionNotice error={validation.error} />}
      {result && (
        <div className={styles.validation}>
          <StatusBadge tone={result.status === "ready" ? "ok" : "warn"}>
            {result.status === "ready" ? "조건 통과" : "준비 필요"}
          </StatusBadge>
          <span className={styles.help}>확인 시각 {formatDateTime(result.checkedAt)}</span>
          {result.reasons.map((reason, index) => (
            <ConnectionNotice key={index} error={reason} />
          ))}
        </div>
      )}
    </Step>
  );
}

function SubmitStep() {
  const state = useLearningStore();
  const runs = selectAgentRuns(state);
  const validation = remoteData(state.validation);
  const blockers = submitBlockers({
    agent: state.agent,
    dataset: remoteData(state.dataset),
    method: state.method,
    quote: remoteData(state.quote),
    limitCurrency: state.limitCurrency,
    limitAmount: state.limitAmount,
    validation,
    costApproved: state.costApproved,
    submitting: state.submitting,
    hasPendingRequest: state.pending !== null,
    activeRun: findActiveRun(runs),
  });
  const quote = remoteData(state.quote);
  const canApprove = validation?.status === "ready" && quote !== null && isPriceKnown(quote);

  return (
    <Step title="5. 학습 요청">
      <label className={styles.check}>
        <input
          type="checkbox"
          checked={state.costApproved}
          disabled={!canApprove}
          onChange={(event) => state.setCostApproved(event.target.checked)}
        />
        <span>
          실제 GPU 비용이 발생할 수 있고, 표시된 금액은 추정치임을 이해합니다. 위 비용 한도로 이번 학습 요청을 승인합니다.
        </span>
      </label>
      <Button data-testid="training-start" onClick={() => void state.submit()} disabled={blockers.length > 0}>
        {state.submitting ? "요청 보내는 중" : "실제 학습 요청"}
      </Button>
      {blockers.length > 0 && !state.submitting && (
        <ul className={styles.blockers} aria-label="요청 전에 필요한 것">
          {blockers.map((blocker) => (
            <li key={blocker}>{blocker}</li>
          ))}
        </ul>
      )}
      {state.submitError && !state.pending && <ConnectionNotice error={state.submitError} />}
    </Step>
  );
}

export function PreparationSteps() {
  return (
    <>
      <DatasetStep />
      <MethodStep />
      <PriceStep />
      <LimitAndValidateStep />
      <SubmitStep />
    </>
  );
}
