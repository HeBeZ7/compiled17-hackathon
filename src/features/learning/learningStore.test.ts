import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentProfile, ModelReference, PriceQuote, TrainingDataset, TrainingRun, TrainingSpec } from "@/shared/contracts";
import { fail, ok } from "@/shared/contracts";

const create = vi.fn();
const list = vi.fn();
const quoteCall = vi.fn();
const validate = vi.fn();

vi.mock("@/shared/api", () => ({
  api: {
    pricing: { quote: (...args: unknown[]) => quoteCall(...args) },
    training: {
      create: (...args: unknown[]) => create(...args),
      list: (...args: unknown[]) => list(...args),
      validate: (...args: unknown[]) => validate(...args),
    },
  },
}));

const memory = new Map<string, string>();
const fakeStorage = {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => void memory.set(key, value),
  removeItem: (key: string) => void memory.delete(key),
};
vi.stubGlobal("window", { localStorage: fakeStorage });

const { useLearningStore } = await import("./learningStore");

const AT = "2026-11-09T00:00:00.000Z";
const unknown = { support: "unknown" as const, evidence: null };
const model: ModelReference = {
  source: "hf",
  publisher: null,
  modelId: "acme/m",
  revision: null,
  licenseRef: null,
  capabilities: { listed: unknown, accessible: unknown, filesPreparable: unknown, inference: unknown, training: unknown, accountVerified: unknown },
};
let agent: AgentProfile;
let agentCounter = 0;
const dataset: TrainingDataset = {
  datasetId: "d1",
  fileName: "a.jsonl",
  sizeBytes: 1,
  format: null,
  exampleCount: null,
  validation: "valid",
  issues: [],
  createdAt: AT,
};
const quote: PriceQuote = {
  quoteId: "q1",
  provider: "prov",
  region: null,
  gpuType: null,
  currency: "USD",
  unit: "gpu_hour",
  unitPrice: 2,
  estimatedTotal: 4,
  queriedAt: AT,
  sourceUrl: null,
  freshness: "live",
  cachedAt: null,
  excludedCosts: [],
  notes: null,
};

function runFor(spec: TrainingSpec, requestKey: string): TrainingRun {
  return {
    runId: "run-1",
    providerJobId: null,
    status: "queued",
    statusReason: null,
    requestKey,
    spec,
    artifactId: null,
    trainingCompleted: false,
    runtimeReady: false,
    evaluationResult: null,
    lastObservedAt: null,
    pollError: null,
    createdAt: AT,
    updatedAt: AT,
  };
}

const store = () => useLearningStore.getState();
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function readyToSubmit() {
  useLearningStore.setState({
    dataset: { state: "ready", data: dataset },
    method: "lora",
    quote: { state: "ready", data: quote },
    limitCurrency: "USD",
    limitAmount: "10",
    validation: { state: "ready", data: { status: "ready", reasons: [], checkedAt: AT } },
    costApproved: true,
  });
}

function storedKey(): string {
  return `aa.learning.pending.${agent.agentId}`;
}

beforeEach(async () => {
  vi.clearAllMocks();
  memory.clear();
  agentCounter++;
  agent = {
    agentId: `11111111-1111-4111-8111-${String(agentCounter).padStart(12, "0")}`,
    name: "Choco",
    selectedModel: model,
    avatar: null,
    version: 1,
    createdAt: AT,
    updatedAt: AT,
  };
  list.mockResolvedValue(ok({ runs: [] }));
  store().open(agent);
  await flush();
});

describe("submit", () => {
  it("saves the request key before sending and clears it once the run exists", async () => {
    let storedDuringCall: string | undefined;
    create.mockImplementation(async (input: { spec: TrainingSpec; requestKey: string }) => {
      storedDuringCall = memory.get(storedKey());
      return ok(runFor(input.spec, input.requestKey));
    });
    readyToSubmit();
    await store().submit();

    expect(JSON.parse(storedDuringCall as string).requestKey).toBe(create.mock.calls[0][0].requestKey);
    expect(memory.has(storedKey())).toBe(false);
    expect(store().selectedRunId).toBe("run-1");
    expect(store().pending).toBeNull();
  });

  it("refuses to send when the key cannot be stored", async () => {
    const original = fakeStorage.setItem;
    fakeStorage.setItem = () => {
      throw new Error("quota");
    };
    readyToSubmit();
    await store().submit();
    fakeStorage.setItem = original;

    expect(create).not.toHaveBeenCalled();
    expect(store().submitError?.code).toBe("BLOCKED");
  });

  it("clears the request on a definite refusal", async () => {
    create.mockResolvedValue(fail("BLOCKED", "Conditions not met"));
    readyToSubmit();
    await store().submit();
    expect(store().pending).toBeNull();
    expect(memory.has(storedKey())).toBe(false);
    expect(store().submitError?.code).toBe("BLOCKED");
    expect(store().costApproved).toBe(false);
  });

  it("does not resend on an unknown outcome and keeps the key for checking", async () => {
    create.mockResolvedValue(fail("NETWORK_ERROR", "Dropped", { retryable: true }));
    readyToSubmit();
    await store().submit();

    expect(create).toHaveBeenCalledTimes(1);
    expect(store().pending).not.toBeNull();
    expect(memory.has(storedKey())).toBe(true);
    expect(store().pendingCheck).toEqual({ state: "ready", data: "absent" });
  });

  it("attaches the existing run when the server has the key after an unknown outcome", async () => {
    let key = "";
    let spec: TrainingSpec | undefined;
    create.mockImplementation(async (input: { spec: TrainingSpec; requestKey: string }) => {
      key = input.requestKey;
      spec = input.spec;
      return fail("STATUS_UNKNOWN", "Unknown");
    });
    list.mockImplementation(async () => ok({ runs: key && spec ? [runFor(spec, key)] : [] }));
    readyToSubmit();
    await store().submit();

    expect(create).toHaveBeenCalledTimes(1);
    expect(store().pending).toBeNull();
    expect(store().selectedRunId).toBe("run-1");
  });

  it("resends with the same key only on request", async () => {
    create.mockResolvedValueOnce(fail("PROVIDER_TIMEOUT", "Timed out"));
    readyToSubmit();
    await store().submit();
    const firstKey = create.mock.calls[0][0].requestKey;

    create.mockImplementationOnce(async (input: { spec: TrainingSpec; requestKey: string }) =>
      ok(runFor(input.spec, input.requestKey)),
    );
    await store().resendPending();
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[1][0].requestKey).toBe(firstKey);
  });

  it("does not allow a second request while one is unresolved", async () => {
    create.mockResolvedValue(fail("NETWORK_ERROR", "Dropped", { retryable: true }));
    readyToSubmit();
    await store().submit();
    readyToSubmit();
    await store().submit();
    expect(create).toHaveBeenCalledTimes(1);
  });
});

describe("reopening after a reload", () => {
  it("restores an unresolved request and reattaches its run", async () => {
    const requestKey = "33333333-3333-4333-8333-333333333333";
    const spec: TrainingSpec = {
      agentId: "99999999-9999-4999-8999-999999999999",
      profileVersion: 1,
      baseModel: model,
      method: "lora",
      datasetId: "d1",
      config: {},
      provider: "prov",
      costLimit: { currency: "USD", amount: 10 },
    };
    memory.set(`aa.learning.pending.${spec.agentId}`, JSON.stringify({ requestKey, spec, quoteId: null, savedAt: AT }));
    list.mockResolvedValue(ok({ runs: [runFor(spec, requestKey)] }));

    store().open({ ...agent, agentId: spec.agentId });
    await flush();

    expect(create).not.toHaveBeenCalled();
    expect(store().pending).toBeNull();
    expect(store().selectedRunId).toBe("run-1");
    expect(memory.has(`aa.learning.pending.${spec.agentId}`)).toBe(false);
  });
});

describe("opening the panel", () => {
  const spec = (agentId: string): TrainingSpec => ({
    agentId,
    profileVersion: 1,
    baseModel: model,
    method: "lora",
    datasetId: "d1",
    config: {},
    provider: "prov",
    costLimit: { currency: "USD", amount: 10 },
  });

  it("shows this agent's run still in progress", async () => {
    list.mockResolvedValue(ok({ runs: [runFor(spec(agent.agentId), "33333333-3333-4333-8333-333333333333")] }));
    await store().refreshRuns();
    expect(store().selectedRunId).toBe("run-1");
  });

  it("leaves a finished run in the history", async () => {
    const finished = { ...runFor(spec(agent.agentId), "33333333-3333-4333-8333-333333333333"), status: "completed" as const };
    list.mockResolvedValue(ok({ runs: [finished] }));
    await store().refreshRuns();
    expect(store().selectedRunId).toBeNull();
  });

  it("does not show another agent's run", async () => {
    list.mockResolvedValue(
      ok({ runs: [runFor(spec("99999999-9999-4999-8999-999999999998"), "33333333-3333-4333-8333-333333333333")] }),
    );
    await store().refreshRuns();
    expect(store().selectedRunId).toBeNull();
  });
});

describe("stale work", () => {
  it("clears the quote and approval when the profile version changes", async () => {
    readyToSubmit();
    store().open({ ...agent, version: 2 });
    await flush();
    expect(store().quote.state).toBe("idle");
    expect(store().validation.state).toBe("idle");
    expect(store().costApproved).toBe(false);
    expect(store().dataset.state).toBe("ready");
  });

  it("drops a quote that arrives after the method changed", async () => {
    let resolveQuote: (value: unknown) => void = () => {};
    quoteCall.mockReturnValue(new Promise((resolve) => (resolveQuote = resolve)));
    const pendingQuote = store().requestQuote();
    store().setMethod("qlora");
    resolveQuote(ok(quote));
    await pendingQuote;
    expect(store().quote.state).toBe("idle");
  });

  it("withdraws approval when the limit changes", () => {
    readyToSubmit();
    store().setLimit({ amount: "99" });
    expect(store().costApproved).toBe(false);
    expect(store().validation.state).toBe("idle");
  });

  it("keeps a failed quote as an error, not as a free price", async () => {
    quoteCall.mockResolvedValue(fail("NOT_CONNECTED", "Not connected"));
    await store().requestQuote();
    expect(store().quote).toMatchObject({ state: "error", error: { code: "NOT_CONNECTED" } });
  });
});
