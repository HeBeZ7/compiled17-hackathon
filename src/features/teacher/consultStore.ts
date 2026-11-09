"use client";

import { create } from "zustand";
import { api } from "@/shared/api";
import type { AgentProfile, ApiError } from "@/shared/contracts";
import { buildTeacherRequest, isCurrentResponse, modelKey, type ConsultLine } from "./conversation";

interface ConsultState {
  agent: AgentProfile | null;
  lines: ConsultLine[];
  waiting: boolean;
  error: ApiError | null;
  /** System fact about the conversation, such as a model change. Never written as the teacher. */
  notice: string | null;
  bind: (agent: AgentProfile | null) => void;
  send: (content: string) => void;
  retry: () => void;
  cancel: () => void;
}

let inFlight: { requestId: string; controller: AbortController } | null = null;

function abortInFlight(): boolean {
  if (!inFlight) return false;
  inFlight.controller.abort();
  inFlight = null;
  return true;
}

export const useConsultStore = create<ConsultState>((set, get) => {
  const dispatch = async () => {
    const { agent, lines } = get();
    if (!agent) return;
    abortInFlight();
    const requestId = crypto.randomUUID();
    const controller = new AbortController();
    inFlight = { requestId, controller };
    set({ waiting: true, error: null, notice: null });

    const result = await api.teacher.ask(buildTeacherRequest(agent, lines, requestId), controller.signal);
    if (inFlight?.requestId !== requestId) return;
    inFlight = null;

    if (!result.ok) {
      set({ waiting: false, error: result.error });
      return;
    }
    if (!isCurrentResponse(result.data, { requestId, agent: get().agent ?? agent })) {
      set({ waiting: false, notice: "에이전트 정보가 바뀌어 늦게 도착한 답변을 버렸습니다. 다시 보내 주세요." });
      return;
    }
    const { reply, replySource, teacherModel, connection, recommendations } = result.data;
    const line: ConsultLine = {
      id: crypto.randomUUID(),
      role: "teacher",
      content: reply,
      at: new Date().toISOString(),
      source: replySource,
      teacherModel,
      connection,
      recommendations,
    };
    set((state) => ({ waiting: false, lines: [...state.lines, line] }));
  };

  return {
    agent: null,
    lines: [],
    waiting: false,
    error: null,
    notice: null,

    bind: (agent) => {
      const previous = get().agent;
      if (previous?.agentId === agent?.agentId && previous?.version === agent?.version) return;
      const wasWaiting = abortInFlight();

      if (!previous || !agent || previous.agentId !== agent.agentId) {
        set({ agent, lines: [], waiting: false, error: null, notice: null });
        return;
      }
      if (modelKey(previous.selectedModel) !== modelKey(agent.selectedModel)) {
        const name = agent.selectedModel?.modelId ?? "선택 없음";
        set({
          agent,
          lines: [],
          waiting: false,
          error: null,
          notice: `학생 모델이 ${name}(으)로 바뀌어 새 상담을 시작합니다. 이전 대화는 이전 모델 기준이었습니다.`,
        });
        return;
      }
      set({
        agent,
        waiting: false,
        notice: wasWaiting ? "에이전트 정보가 바뀌어 기다리던 답변을 취소했습니다. 다시 보내 주세요." : get().notice,
      });
    },

    send: (content) => {
      const { agent, waiting } = get();
      const text = content.trim();
      if (!agent || !text || waiting) return;
      const line: ConsultLine = {
        id: crypto.randomUUID(),
        role: "user",
        content: text,
        at: new Date().toISOString(),
        source: "user",
        teacherModel: null,
        connection: null,
        recommendations: [],
      };
      set((state) => ({ lines: [...state.lines, line] }));
      void dispatch();
    },

    retry: () => {
      const { waiting, lines } = get();
      if (!waiting && lines.at(-1)?.role === "user") void dispatch();
    },

    cancel: () => {
      if (abortInFlight()) set({ waiting: false, notice: "답변 기다리기를 취소했습니다." });
    },
  };
});
