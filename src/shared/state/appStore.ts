"use client";

import { create } from "zustand";
import { api } from "@/shared/api";
import type { AgentProfile, ApiError } from "@/shared/contracts";

export type ClassroomOverlay = "none" | "teacher" | "learning";

interface AppState {
  agent: AgentProfile | null;
  agentLoad: "idle" | "loading" | "ready" | "failed";
  agentError: ApiError | null;
  overlay: ClassroomOverlay;
  textInputFocused: boolean;
  loadAgent: () => Promise<void>;
  setAgent: (agent: AgentProfile) => void;
  openOverlay: (overlay: Exclude<ClassroomOverlay, "none">) => void;
  closeOverlay: () => void;
  setTextInputFocused: (focused: boolean) => void;
}

// A stalled request must end in a retryable error, not an endless loading screen.
const AGENT_LOAD_TIMEOUT_MS = 20_000;

// Bumped by every agent write so a slow load cannot overwrite a newer selection.
let agentWriteEpoch = 0;

export const useAppStore = create<AppState>((set) => ({
  agent: null,
  agentLoad: "idle",
  agentError: null,
  overlay: "none",
  textInputFocused: false,

  loadAgent: async () => {
    const epoch = ++agentWriteEpoch;
    set({ agentLoad: "loading", agentError: null });
    const result = await api.agents.current(AbortSignal.timeout(AGENT_LOAD_TIMEOUT_MS));
    if (epoch !== agentWriteEpoch) return;
    if (result.ok) set({ agent: result.data.agent, agentLoad: "ready" });
    else set({ agentLoad: "failed", agentError: result.error });
  },

  setAgent: (agent) => {
    agentWriteEpoch++;
    set({ agent, agentLoad: "ready", agentError: null });
  },

  openOverlay: (overlay) => set({ overlay }),
  closeOverlay: () => set({ overlay: "none" }),
  setTextInputFocused: (textInputFocused) => set({ textInputFocused }),
}));

export const selectMovementLocked = (state: AppState): boolean =>
  state.overlay !== "none" || state.textInputFocused;
