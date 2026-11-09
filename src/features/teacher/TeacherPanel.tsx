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

const AGENT_REQUIRED = fail("BLOCKED", "Agent needed: create an agent before talking to your teacher").error;

function TeacherLine({ line }: { line: ConsultLine }) {
  return (
    <article className={styles.line} data-role={line.role}>
      {line.source === "static_notice" && <StatusBadge tone="unknown">Fixed notice · not a model reply</StatusBadge>}
      {line.source === "llm" && (
        <span className={styles.badges}>
          <StatusBadge tone="ok">AI reply · {line.teacherModel?.modelId ?? "Model unknown"}</StatusBadge>
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
    <div ref={dialogRef} className={styles.shell} role="dialog" aria-modal="true" aria-label="Talk to your teacher">
      <Panel className={styles.panel}>
        <div className={styles.head}>
          <h2 tabIndex={-1} data-dialog-title>
            Talk to your teacher
          </h2>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>

        <div className={styles.scroll}>
          <ModelSummary model={agent?.selectedModel ?? null} />

          <div className={styles.welcome}>
            <StatusBadge tone="unknown">Fixed welcome · not a model reply</StatusBadge>
            <p className={styles.welcomeText}>What would you like to learn?</p>
            <p className={styles.meta}>Replies appear only when the teacher model is connected</p>
          </div>

          {!agent && (
            <>
              <ConnectionNotice error={AGENT_REQUIRED} />
              <ButtonLink href="/create" variant="secondary">
                Create an agent
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
              <span>Waiting for the teacher model&apos;s reply</span>
              <Button variant="ghost" onClick={cancel}>
                Cancel request
              </Button>
            </div>
          )}

          {error && <ConnectionNotice error={error} />}
          {error?.code === "CONFLICT" && (
            <Button variant="secondary" onClick={() => void loadAgent()}>
              Reload agent details
            </Button>
          )}
          {unanswered && (
            <Button variant="secondary" onClick={retry}>
              Resend last message
            </Button>
          )}
          <div ref={endRef} />
        </div>

        <form className={styles.form} onSubmit={submit}>
          <label htmlFor="teacher-message">Your message to the teacher</label>
          <textarea
            id="teacher-message"
            data-testid="teacher-input"
            rows={3}
            maxLength={MAX_MESSAGE_LENGTH}
            placeholder="Describe your situation and what your agent should be able to do"
            value={draft}
            disabled={!agent}
            onChange={(event) => setDraft(event.target.value)}
          />
          <div className={styles.actions}>
            <Button variant="secondary" onClick={onOpenLearning}>
              Open learning station
            </Button>
            <Button type="submit" disabled={!agent || !draft.trim() || waiting}>
              {waiting ? "Waiting" : "Send"}
            </Button>
          </div>
        </form>
      </Panel>
    </div>
  );
}
