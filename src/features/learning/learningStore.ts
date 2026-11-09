"use client";

import { create } from "zustand";
import { api } from "@/shared/api";
import {
  fail,
  type AgentProfile,
  type ApiError,
  type PriceQuote,
  type TrainingDataset,
  type TrainingMethod,
  type TrainingRun,
  type TrainingValidation,
} from "@/shared/contracts";
import { modelKey } from "@/features/teacher/conversation";
import {
  activeRun,
  buildTrainingSpec,
  classifyCreateFailure,
  mergeRun,
  parsePositive,
  runsForAgent,
  type SpecInput,
} from "./learningLogic";
import { clearPendingRequest, loadPendingRequest, savePendingRequest, type PendingRequest } from "./pendingRequest";

export type Remote<T> =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "ready"; data: T }
  | { state: "error"; error: ApiError };

const IDLE = { state: "idle" } as const;
const LOADING = { state: "loading" } as const;

export function remoteData<T>(remote: Remote<T>): T | null {
  return remote.state === "ready" ? remote.data : null;
}

interface LearningState {
  agent: AgentProfile | null;
  dataset: Remote<TrainingDataset>;
  method: TrainingMethod | null;
  hours: string;
  quote: Remote<PriceQuote>;
  limitCurrency: string;
  limitAmount: string;
  validation: Remote<TrainingValidation>;
  costApproved: boolean;
  submitting: boolean;
  submitError: ApiError | null;
  /** A create call whose outcome is not yet known. */
  pending: PendingRequest | null;
  /** "absent" means the server was asked and has no run under this request key. */
  pendingCheck: Remote<"absent">;
  runs: TrainingRun[];
  runsLoad: Remote<true>;
  selectedRunId: string | null;

  open: (agent: AgentProfile | null) => void;
  uploadDataset: (file: File) => Promise<void>;
  setMethod: (method: TrainingMethod | null) => void;
  setHours: (hours: string) => void;
  requestQuote: () => Promise<void>;
  setLimit: (limit: { currency?: string; amount?: string }) => void;
  validate: () => Promise<void>;
  setCostApproved: (approved: boolean) => void;
  submit: () => Promise<void>;
  recheckPending: () => Promise<void>;
  resendPending: () => Promise<void>;
  discardPending: () => void;
  refreshRuns: () => Promise<void>;
  upsertRun: (run: TrainingRun) => void;
  selectRun: (runId: string | null) => void;
}

let datasetSeq = 0;
let quoteSeq = 0;
let validateSeq = 0;
let quoteAbort: AbortController | null = null;
let validateAbort: AbortController | null = null;

function cancelPriceWork() {
  quoteSeq++;
  validateSeq++;
  quoteAbort?.abort();
  validateAbort?.abort();
  quoteAbort = null;
  validateAbort = null;
}

function cancelValidationWork() {
  validateSeq++;
  validateAbort?.abort();
  validateAbort = null;
}

function specInput(state: LearningState): SpecInput {
  return {
    agent: state.agent,
    dataset: remoteData(state.dataset),
    method: state.method,
    quote: remoteData(state.quote),
    limitCurrency: state.limitCurrency,
    limitAmount: state.limitAmount,
  };
}

export const useLearningStore = create<LearningState>((set, get) => {
  const applyCreateResult = async (pending: PendingRequest, result: Awaited<ReturnType<typeof api.training.create>>) => {
    const agentId = pending.spec.agentId;
    if (result.ok) {
      clearPendingRequest(agentId);
      set((state) => ({
        pending: null,
        pendingCheck: IDLE,
        submitting: false,
        submitError: null,
        costApproved: false,
        runs: mergeRun(state.runs, result.data),
        selectedRunId: result.data.runId,
      }));
      return;
    }
    if (classifyCreateFailure(result.error.code) === "rejected") {
      clearPendingRequest(agentId);
      set({ pending: null, pendingCheck: IDLE, submitting: false, submitError: result.error, costApproved: false });
      return;
    }
    set({ submitting: false, submitError: result.error, pendingCheck: IDLE });
    await get().recheckPending();
  };

  // No abort signal: closing the panel must not look like the request was withdrawn.
  const sendPending = async (pending: PendingRequest) => {
    set({ pending, submitting: true, submitError: null });
    const result = await api.training.create({
      spec: pending.spec,
      requestKey: pending.requestKey,
      quoteId: pending.quoteId,
    });
    await applyCreateResult(pending, result);
  };

  return {
    agent: null,
    dataset: IDLE,
    method: null,
    hours: "",
    quote: IDLE,
    limitCurrency: "",
    limitAmount: "",
    validation: IDLE,
    costApproved: false,
    submitting: false,
    submitError: null,
    pending: null,
    pendingCheck: IDLE,
    runs: [],
    runsLoad: IDLE,
    selectedRunId: null,

    open: (agent) => {
      const previous = get().agent;
      if (previous?.agentId !== agent?.agentId) {
        cancelPriceWork();
        datasetSeq++;
        set({
          agent,
          dataset: IDLE,
          method: null,
          hours: "",
          quote: IDLE,
          limitCurrency: "",
          limitAmount: "",
          validation: IDLE,
          costApproved: false,
          submitError: null,
          pending: agent ? loadPendingRequest(agent.agentId) : null,
          pendingCheck: IDLE,
          runs: [],
          runsLoad: IDLE,
          selectedRunId: null,
        });
      } else if (previous?.version !== agent?.version) {
        // A quote and approval were made for the old profile. The dataset and method choice still apply.
        cancelPriceWork();
        const modelChanged = modelKey(previous?.selectedModel ?? null) !== modelKey(agent?.selectedModel ?? null);
        set({
          agent,
          quote: IDLE,
          validation: IDLE,
          costApproved: false,
          ...(modelChanged ? { limitCurrency: "", limitAmount: "" } : {}),
        });
      }
      if (!agent) return;
      void get().refreshRuns();
      if (get().pending && !get().submitting) void get().recheckPending();
    },

    uploadDataset: async (file) => {
      const seq = ++datasetSeq;
      cancelValidationWork();
      set({ dataset: LOADING, validation: IDLE, costApproved: false });
      const form = new FormData();
      form.set("file", file);
      const result = await api.training.uploadDataset(form);
      if (seq !== datasetSeq) return;
      set({ dataset: result.ok ? { state: "ready", data: result.data } : { state: "error", error: result.error } });
    },

    setMethod: (method) => {
      cancelPriceWork();
      set({ method, quote: IDLE, validation: IDLE, costApproved: false });
    },

    setHours: (hours) => {
      cancelPriceWork();
      set({ hours, quote: IDLE, validation: IDLE, costApproved: false });
    },

    requestQuote: async () => {
      const { agent, method, hours } = get();
      if (!agent?.selectedModel) return;
      cancelPriceWork();
      const seq = quoteSeq;
      const controller = new AbortController();
      quoteAbort = controller;
      set({ quote: LOADING, validation: IDLE, costApproved: false });
      const result = await api.pricing.quote(
        {
          baseModel: agent.selectedModel,
          method,
          provider: null,
          region: null,
          gpuType: null,
          estimatedHours: parsePositive(hours),
        },
        controller.signal,
      );
      if (seq !== quoteSeq) return;
      if (!result.ok) {
        set({ quote: { state: "error", error: result.error } });
        return;
      }
      set((state) => ({
        quote: { state: "ready", data: result.data },
        limitCurrency: state.limitCurrency || (result.data.currency ?? ""),
      }));
    },

    setLimit: ({ currency, amount }) => {
      cancelValidationWork();
      set((state) => ({
        limitCurrency: currency ?? state.limitCurrency,
        limitAmount: amount ?? state.limitAmount,
        validation: IDLE,
        costApproved: false,
      }));
    },

    validate: async () => {
      const spec = buildTrainingSpec(specInput(get()));
      if (!spec) return;
      cancelValidationWork();
      const seq = validateSeq;
      const controller = new AbortController();
      validateAbort = controller;
      set({ validation: LOADING, costApproved: false });
      const result = await api.training.validate(spec, controller.signal);
      if (seq !== validateSeq) return;
      set({ validation: result.ok ? { state: "ready", data: result.data } : { state: "error", error: result.error } });
    },

    setCostApproved: (costApproved) => set({ costApproved }),

    submit: async () => {
      const state = get();
      if (state.submitting || state.pending) return;
      const spec = buildTrainingSpec(specInput(state));
      if (!spec || !state.costApproved) return;
      const pending: PendingRequest = {
        requestKey: crypto.randomUUID(),
        spec,
        quoteId: remoteData(state.quote)?.quoteId ?? null,
        savedAt: new Date().toISOString(),
      };
      if (!savePendingRequest(pending)) {
        set({
          submitError: fail(
            "BLOCKED",
            "이 브라우저에 요청 기록을 저장하지 못해 학습을 요청하지 않았습니다. 기록 없이 보내면 중복 실행을 막을 수 없습니다.",
          ).error,
        });
        return;
      }
      await sendPending(pending);
    },

    recheckPending: async () => {
      const pending = get().pending;
      if (!pending) return;
      set({ pendingCheck: LOADING });
      const result = await api.training.list();
      if (get().pending?.requestKey !== pending.requestKey) return;
      if (!result.ok) {
        set({ pendingCheck: { state: "error", error: result.error } });
        return;
      }
      const found = result.data.runs.find((run) => run.requestKey === pending.requestKey);
      if (found) {
        clearPendingRequest(pending.spec.agentId);
        set({ runs: result.data.runs, pending: null, pendingCheck: IDLE, submitError: null, selectedRunId: found.runId });
        return;
      }
      set({ runs: result.data.runs, pendingCheck: { state: "ready", data: "absent" } });
    },

    resendPending: async () => {
      const { pending, submitting, pendingCheck } = get();
      if (!pending || submitting || pendingCheck.state !== "ready") return;
      await sendPending(pending);
    },

    discardPending: () => {
      const { pending, submitting } = get();
      if (!pending || submitting) return;
      clearPendingRequest(pending.spec.agentId);
      set({ pending: null, pendingCheck: IDLE, submitError: null, costApproved: false });
    },

    refreshRuns: async () => {
      const agentId = get().agent?.agentId;
      set({ runsLoad: LOADING });
      const result = await api.training.list();
      if (get().agent?.agentId !== agentId) return;
      if (!result.ok) {
        set({ runsLoad: { state: "error", error: result.error } });
        return;
      }
      set((state) => {
        const runs = result.data.runs.reduce(mergeRun, state.runs);
        // Reopening the panel returns to a lesson still in progress instead of an empty form.
        const running = agentId && !state.pending ? activeRun(runsForAgent(runs, agentId)) : null;
        return {
          runs,
          runsLoad: { state: "ready", data: true },
          selectedRunId: state.selectedRunId ?? running?.runId ?? null,
        };
      });
    },

    upsertRun: (run) => set((state) => ({ runs: mergeRun(state.runs, run) })),

    selectRun: (selectedRunId) => set({ selectedRunId }),
  };
});

export function selectAgentRuns(state: Pick<LearningState, "agent" | "runs">): TrainingRun[] {
  return state.agent ? runsForAgent(state.runs, state.agent.agentId) : [];
}
