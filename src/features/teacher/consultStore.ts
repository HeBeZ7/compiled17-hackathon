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
      set({ waiting: false, notice: "Agent details changed so the late reply was discarded · please send again" });
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
        const name = agent.selectedModel?.modelId ?? "None selected";
        set({
          agent,
          lines: [],
          waiting: false,
          error: null,
          notice: `Student model changed to ${name} · starting a new consultation because the earlier one was about the previous model`,
        });
        return;
      }
      set({
        agent,
        waiting: false,
        notice: wasWaiting ? "Agent details changed so the pending reply was canceled · please send again" : get().notice,
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
      if (abortInFlight()) set({ waiting: false, notice: "Stopped waiting for the reply" });
    },
  };
});
