"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "@/shared/api";
import { fail, type ApiError, type TeacherMessage, type TeacherPanelProps } from "@/shared/contracts";
import { Button, ConnectionNotice, Panel, StatusBadge } from "@/shared/ui";
import styles from "./TeacherPanel.module.css";

const AGENT_REQUIRED = fail("BLOCKED", "에이전트 필요: 상담을 시작하려면 먼저 에이전트를 만들어 주세요.").error;

interface Line extends TeacherMessage {
  source: "user" | "llm" | "static_notice";
}

/** Placeholder owned by D: wires the panel to the teacher API. */
export function TeacherPanel({ agent, onClose, onOpenLearning }: TeacherPanelProps) {
  const [lines, setLines] = useState<Line[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const inFlight = useRef<AbortController | null>(null);

  const agentVersion = agent?.version;
  useEffect(() => {
    // A changed profile, or closing the panel, invalidates any pending answer.
    return () => inFlight.current?.abort();
  }, [agentVersion]);

  const send = async (event: FormEvent) => {
    event.preventDefault();
    const content = draft.trim();
    if (!agent || !content || busy) return;

    const userLine: Line = { role: "user", content, at: new Date().toISOString(), source: "user" };
    const conversation = [...lines, userLine];
    const requestId = crypto.randomUUID();
    const controller = new AbortController();
    inFlight.current = controller;
    setLines(conversation);
    setDraft("");
    setError(null);
    setBusy(true);

    const result = await api.teacher.ask(
      {
        requestId,
        agentId: agent.agentId,
        profileVersion: agent.version,
        studentModel: agent.selectedModel,
        messages: conversation.map(({ role, content: text, at }) => ({ role, content: text, at })),
        userGoal: null,
      },
      controller.signal,
    );

    setBusy(false);
    if (controller.signal.aborted) return;
    if (!result.ok) {
      setError(result.error);
    } else if (result.data.requestId === requestId) {
      setLines([
        ...conversation,
        { role: "teacher", content: result.data.reply, at: new Date().toISOString(), source: result.data.replySource },
      ]);
    }
  };

  return (
    <Panel className={styles.panel} role="dialog" aria-label="선생님 상담">
      <div className={styles.head}>
        <h2>선생님 상담</h2>
        <Button variant="ghost" onClick={onClose}>
          닫기
        </Button>
      </div>

      <div className={styles.line}>
        <StatusBadge tone="unknown">고정 안내 · 모델 응답 아님</StatusBadge>
        <p>어서 와요. 어떤 수업을 원하는지 들려주세요.</p>
      </div>

      {!agent && <ConnectionNotice error={AGENT_REQUIRED} />}

      {lines.map((line) => (
        <div key={line.at + line.role} className={styles.line} data-role={line.role}>
          {line.source === "static_notice" && <StatusBadge tone="unknown">고정 안내</StatusBadge>}
          <p>{line.content}</p>
        </div>
      ))}

      {error && <ConnectionNotice error={error} />}

      <form className={styles.form} onSubmit={send}>
        <label htmlFor="teacher-message">선생님에게 할 말</label>
        <textarea
          id="teacher-message"
          rows={3}
          maxLength={8000}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <div className={styles.actions}>
          <Button variant="secondary" onClick={onOpenLearning}>
            학습 준비 열기
          </Button>
          <Button type="submit" disabled={!agent || !draft.trim() || busy}>
            {busy ? "기다리는 중" : "전송"}
          </Button>
        </div>
      </form>
    </Panel>
  );
}
