"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { fail, type TeacherPanelProps } from "@/shared/contracts";
import { useAppStore } from "@/shared/state/appStore";
import { Button, ButtonLink, ConnectionBadge, ConnectionNotice, Panel, StatusBadge } from "@/shared/ui";
import { useConsultStore } from "./consultStore";
import { MAX_MESSAGE_LENGTH, type ConsultLine } from "./conversation";
import { ModelSummary } from "./ModelSummary";
import { RecommendationCard } from "./RecommendationCard";
import styles from "./TeacherPanel.module.css";
import { useDialogBehavior } from "./useDialogBehavior";

const AGENT_REQUIRED = fail("BLOCKED", "에이전트 필요: 상담을 시작하려면 먼저 에이전트를 만들어 주세요.").error;

function TeacherLine({ line }: { line: ConsultLine }) {
  return (
    <article className={styles.line} data-role={line.role}>
      {line.source === "static_notice" && <StatusBadge tone="unknown">고정 안내 · 모델 응답 아님</StatusBadge>}
      {line.source === "llm" && (
        <span className={styles.badges}>
          <StatusBadge tone="ok">AI 응답 · {line.teacherModel?.modelId ?? "모델 미확인"}</StatusBadge>
          {line.connection && line.connection !== "connected" && <ConnectionBadge state={line.connection} />}
        </span>
      )}
      <p className={styles.text}>{line.content}</p>
      {line.recommendations.map((item, index) => (
        <RecommendationCard key={index} item={item} />
      ))}
    </article>
  );
}

export function TeacherPanel({ agent, onClose, onOpenLearning }: TeacherPanelProps) {
  const { lines, waiting, error, notice, bind, send, retry, cancel } = useConsultStore();
  const loadAgent = useAppStore((state) => state.loadAgent);
  const [draft, setDraft] = useState("");
  const dialogRef = useDialogBehavior(onClose);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => bind(agent), [agent, bind]);

  // Closing the panel withdraws the question; the unanswered line stays so it can be re-sent.
  useEffect(() => () => useConsultStore.getState().cancel(), []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [lines.length, waiting, error, notice]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!agent || !draft.trim() || waiting) return;
    send(draft);
    setDraft("");
  };

  const unanswered = !waiting && lines.at(-1)?.role === "user";

  return (
    <div ref={dialogRef} className={styles.shell} role="dialog" aria-modal="true" aria-label="선생님 상담">
      <Panel className={styles.panel}>
        <div className={styles.head}>
          <h2 tabIndex={-1} data-dialog-title>
            선생님 상담
          </h2>
          <Button variant="ghost" onClick={onClose}>
            닫기
          </Button>
        </div>

        <div className={styles.scroll}>
          <ModelSummary model={agent?.selectedModel ?? null} />

          <div className={styles.line}>
            <StatusBadge tone="unknown">고정 안내 · 모델 응답 아님</StatusBadge>
            <p className={styles.text}>
              어서 와요. 어떤 상황에서 어떤 능력을 가르치고 싶은지 들려주세요. 답변은 상담 모델이 연결되어 있을 때만
              만들어집니다.
            </p>
          </div>

          {!agent && (
            <>
              <ConnectionNotice error={AGENT_REQUIRED} />
              <ButtonLink href="/create" variant="secondary">
                에이전트 만들기
              </ButtonLink>
            </>
          )}

          {lines.map((line) => (
            <TeacherLine key={line.id} line={line} />
          ))}

          {notice && (
            <p className={styles.notice} role="status">
              {notice}
            </p>
          )}

          {waiting && (
            <div className={styles.waiting} role="status">
              <span>상담 모델의 답변을 기다리는 중입니다.</span>
              <Button variant="ghost" onClick={cancel}>
                요청 취소
              </Button>
            </div>
          )}

          {error && <ConnectionNotice error={error} />}
          {error?.code === "CONFLICT" && (
            <Button variant="secondary" onClick={() => void loadAgent()}>
              에이전트 정보 다시 불러오기
            </Button>
          )}
          {unanswered && (
            <Button variant="secondary" onClick={retry}>
              마지막 말 다시 보내기
            </Button>
          )}
          <div ref={endRef} />
        </div>

        <form className={styles.form} onSubmit={submit}>
          <label htmlFor="teacher-message">선생님에게 할 말</label>
          <textarea
            id="teacher-message"
            data-testid="teacher-input"
            rows={3}
            maxLength={MAX_MESSAGE_LENGTH}
            placeholder="예: 내 상황과 에이전트가 할 수 있었으면 하는 일"
            value={draft}
            disabled={!agent}
            onChange={(event) => setDraft(event.target.value)}
          />
          <div className={styles.actions}>
            <Button variant="secondary" onClick={onOpenLearning}>
              학습 준비 열기
            </Button>
            <Button type="submit" disabled={!agent || !draft.trim() || waiting}>
              {waiting ? "기다리는 중" : "전송"}
            </Button>
          </div>
        </form>
      </Panel>
    </div>
  );
}
