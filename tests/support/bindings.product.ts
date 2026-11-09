import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { useConsultStore } from "@/features/teacher/consultStore";
import { createArtifactService, type RuntimeProvider } from "@/server/artifacts/service";
import { createPricingService, type PriceProvider, type TrainingPrice } from "@/server/pricing/service";
import { getCurrentAgent, saveCurrentAgent } from "@/server/store";
import { createStore, type Store } from "@/server/store/store";
import { askTeacherWith, type TeacherDeps } from "@/server/teacher";
import type { ProviderJob, ProviderResult, TrainingProvider } from "@/server/training/provider";
import { createTrainingService } from "@/server/training/service";
import {
  TeacherRequest,
  fail,
  notConnected,
  ok,
  type ModelCapabilities,
  type ModelReference,
  type PriceQuote,
  type RequestContext,
  type RuntimeStatus,
  type TeacherResponse,
  type TrainingRun,
  type TrainingSpec,
} from "@/shared/contracts";
import type {
  Bindings,
  LivePrice,
  LlmRequest,
  ModelRef,
  PricingHarness,
  ProviderJobState,
  QuoteView,
  RunView,
  ScriptedLlm,
  ScriptedProvider,
  TeacherHarness,
  TeacherMessage,
  TeacherState,
  TrainingHarness,
  TrainingPort,
} from "./ports";

// 실제 서비스(E의 학습·가격·결과물, D의 상담과 클라이언트 상담 저장소)를 포트에 연결한다.
// 공급자, 가격 원천, LLM, Hugging Face HTTP만 테스트 대역이며 외부 네트워크를 쓰지 않는다.

const tempDirs: string[] = [];
process.once("exit", () => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

function tempDir(prefix: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

const NEBIUS = "nebius";
/** E의 Nebius 지원 표에 있는 모델. 지원 표 검사를 실제로 통과시키기 위해 쓴다. */
const SUPPORTED_MODEL = "meta-llama/Llama-3.1-8B-Instruct";
const AGENT_ID = "22222222-2222-4222-8222-222222222222";
const unknownClaim = { support: "unknown" as const, evidence: null };
const unknownCapabilities: ModelCapabilities = {
  listed: unknownClaim,
  accessible: unknownClaim,
  filesPreparable: unknownClaim,
  inference: unknownClaim,
  training: unknownClaim,
  accountVerified: unknownClaim,
};

function reference(source: string, modelId: string, revision: string | null = null): ModelReference {
  return { source, publisher: null, modelId, revision, licenseRef: null, capabilities: unknownCapabilities };
}

function context(): RequestContext {
  return { ownerId: `qa-${randomUUID()}`, signal: new AbortController().signal };
}

const DATASET_LINE = '{"messages":[{"role":"user","content":"q"},{"role":"assistant","content":"a"}]}';
const CHECKPOINT_MODEL = "ft:fixture-checkpoint";
const OUTPUT_FILE = "file-output";
const JOB_STATUS = {
  queued: "queued",
  running: "running",
  succeeded: "succeeded",
  failed: "failed",
  canceled: "cancelled",
} as const satisfies Record<ProviderJobState, ProviderJob["status"]>;

const providerError = (message: string) => fail("PROVIDER_ERROR", message, { retryable: true }).error;
const indeterminate = (message: string): ProviderResult<never> => ({ ok: false, error: providerError(message), outcome: "indeterminate" });
const rejected = (message: string): ProviderResult<never> => ({ ok: false, error: providerError(message), outcome: "rejected" });

function scriptedTrainingProvider() {
  let createOutcome: "accepted" | "timeout" | "rejected" = "accepted";
  let job: ProviderJob | null = null;
  let jobListed = false;
  let failPoll = false;
  let artifact: "present" | "missing" = "missing";
  let runtime: "responds" | "load_error" = "load_error";

  const script: ScriptedProvider = {
    counts: { create: 0, cancel: 0 },
    scriptCreate: (outcome) => { createOutcome = outcome; },
    setJob: (state) => { if (job) job = { ...job, status: JOB_STATUS[state] }; },
    failNextPoll: () => { failPoll = true; },
    setArtifact: (outcome) => { artifact = outcome; },
    setRuntime: (outcome) => { runtime = outcome; },
    revealLostJob: () => { jobListed = true; },
  };

  const provider: TrainingProvider = {
    id: NEBIUS,
    requiredConfig: [],
    isConfigured: () => true,
    uploadFile: async () => ({ ok: true, data: { id: "file-input" } }),
    createJob: async (input) => {
      script.counts.create += 1;
      if (createOutcome === "rejected") return rejected("대역 거절");
      job = { id: "ftjob-double", status: "queued", suffix: input.suffix, errorMessage: null, resultFiles: [], trainedSteps: null, totalSteps: null };
      if (createOutcome === "timeout") return indeterminate("대역 timeout");
      jobListed = true;
      return { ok: true, data: job };
    },
    getJob: async () => {
      if (failPoll) {
        failPoll = false;
        return indeterminate("대역 조회 실패");
      }
      return job ? { ok: true, data: job } : rejected("대역 작업 없음");
    },
    listJobs: async () => ({ ok: true, data: { jobs: job && jobListed ? [job] : [], hasMore: false } }),
    cancelJob: async () => {
      script.counts.cancel += 1;
      return job ? { ok: true, data: job } : rejected("대역 작업 없음");
    },
    listCheckpoints: async () => ({
      ok: true,
      data: artifact === "present" ? [{ id: "ckpt-double", stepNumber: 1, modelName: CHECKPOINT_MODEL, resultFiles: [OUTPUT_FILE] }] : [],
    }),
    getFile: async () => ({ ok: true, data: { id: OUTPUT_FILE, filename: "ckpt/adapter_config.json", bytes: 10 } }),
  };

  const runtimeProvider: RuntimeProvider = {
    requiredConfig: [],
    isConfigured: () => true,
    listModels: async () => ({
      ok: true,
      data: [{ id: CHECKPOINT_MODEL, status: runtime === "responds" ? "active" : "error" }],
    }),
    chat: async () => ({ ok: true, data: "대역 응답" }),
  };

  return { script, provider, runtimeProvider };
}

const operatorPrice: PriceProvider = {
  id: NEBIUS,
  trainingPrice: async () => ({ unitPrice: 1, currency: "USD", unit: "per_1m_training_tokens", sourceUrl: "https://fixture.invalid/p", note: "대역" }),
};

function runView(run: TrainingRun, runtime: RuntimeStatus | null): RunView {
  return {
    runId: run.runId,
    requestKey: run.requestKey,
    providerJobId: run.providerJobId,
    status: run.status,
    pollError: run.pollError?.message ?? null,
    blockedReasons: [],
    artifactId: run.artifactId,
    trainingCompleted: run.trainingCompleted,
    // 제품은 로드 결과를 TrainingRun이 아니라 RuntimeStatus에 기록한다. docs/qa O-8 참고.
    runtimeReady: runtime?.state === "loaded",
    runtimeError: runtime?.error?.message ?? null,
    evaluationResult: run.evaluationResult,
  };
}

function blockedView(requestKey: string, reason: string): RunView {
  return {
    runId: "", requestKey, providerJobId: null, status: "blocked", pollError: null, blockedReasons: [reason],
    artifactId: null, trainingCompleted: false, runtimeReady: false, runtimeError: null, evaluationResult: null,
  };
}

function trainingPort(
  store: Store,
  doubles: ReturnType<typeof scriptedTrainingProvider>,
  specs: Record<"valid" | "missing_data" | "unsupported_model", TrainingSpec>,
  ctx: RequestContext,
): TrainingPort {
  const training = createTrainingService({ store, provider: doubles.provider, prices: operatorPrice, maxApprovedUsd: () => 10 });
  const artifacts = createArtifactService({ store, runtime: doubles.runtimeProvider });

  const runtimeOf = async (run: TrainingRun) => {
    if (!run.artifactId) return null;
    const status = await artifacts.getRuntimeStatus(run.artifactId, ctx);
    return status.ok ? status.data : null;
  };
  const view = async (run: TrainingRun) => runView(run, await runtimeOf(run));
  const unwrap = <T>(result: { ok: true; data: T } | { ok: false; error: { code: string; message: string } }): T => {
    if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
    return result.data;
  };

  return {
    async submit({ requestKey, spec }) {
      const result = await training.createTrainingRun({ spec: specs[spec], requestKey, quoteId: null }, ctx);
      // 제품은 차단을 run이 아닌 BLOCKED 오류로 돌려준다. 그 외 오류는 숨기지 않는다.
      if (!result.ok && result.error.code === "BLOCKED") return blockedView(requestKey, result.error.message);
      return view(unwrap(result));
    },
    refresh: async (runId) => view(unwrap(await training.getTrainingRun(runId, ctx))),
    cancel: async (runId) => view(unwrap(await training.cancelTrainingRun(runId, ctx))),
    async loadResult(runId) {
      const run = unwrap(await training.getTrainingRun(runId, ctx));
      if (!run.artifactId) throw new Error("결과물이 없는 run입니다.");
      unwrap(await artifacts.loadArtifactRuntime(run.artifactId, ctx));
      return view(run);
    },
  };
}

async function trainingHarness(): Promise<TrainingHarness> {
  const dbPath = path.join(tempDir("aa-qa-training-"), "t.sqlite");
  let store = createStore(dbPath);
  const doubles = scriptedTrainingProvider();
  const ctx = context();

  const form = new FormData();
  form.set("file", new File([DATASET_LINE], "data.jsonl"));
  const upload = await createTrainingService({ store, provider: doubles.provider, prices: operatorPrice, maxApprovedUsd: () => 10 }).uploadDataset(form, ctx);
  if (!upload.ok) throw new Error(upload.error.message);

  const valid: TrainingSpec = {
    agentId: AGENT_ID,
    profileVersion: 1,
    baseModel: reference("huggingface", SUPPORTED_MODEL),
    method: "lora",
    datasetId: upload.data.datasetId,
    config: {},
    provider: NEBIUS,
    costLimit: { currency: "USD", amount: 5 },
  };
  const specs = {
    valid,
    missing_data: { ...valid, datasetId: "missing-dataset" },
    unsupported_model: { ...valid, baseModel: reference("huggingface", "fixture/not-in-provider-table") },
  };

  return {
    provider: doubles.script,
    service: trainingPort(store, doubles, specs, ctx),
    async restart() {
      store.close();
      store = createStore(dbPath);
      return trainingPort(store, doubles, specs, ctx);
    },
  };
}

function quoteView(quote: PriceQuote): QuoteView {
  return {
    provider: quote.provider,
    region: quote.region,
    currency: quote.currency,
    unit: quote.unit,
    unitPrice: quote.unitPrice,
    estimatedTotal: quote.estimatedTotal,
    queriedAt: quote.queriedAt,
    source: quote.sourceUrl,
    cached: quote.cachedAt !== null,
    freshness: quote.freshness,
    excludedCosts: quote.excludedCosts,
  };
}

async function pricingHarness(): Promise<PricingHarness> {
  const store = createStore(path.join(tempDir("aa-qa-pricing-"), "p.sqlite"));
  let respond: () => TrainingPrice | null = () => null;
  const toPrice = (price: LivePrice): TrainingPrice => ({ unitPrice: price.unitPrice, currency: price.currency, unit: price.unit, sourceUrl: price.source, note: "대역" });

  const prices: PriceProvider = { id: "fixture-cloud", trainingPrice: async () => respond() };
  const service = createPricingService({ store, prices });
  const ctx = context();

  return {
    source: {
      respondLive: (price) => { respond = () => toPrice(price); },
      respondPublishedDoc: (price) => { respond = () => toPrice(price); },
      // 제품 타입은 전 필드를 요구한다. 빠진 값이 와도 지어내지 않는지 보려고 일부러 어긴다.
      respondPartial: (price) => { respond = () => price as unknown as TrainingPrice; },
      fail: () => { respond = () => { throw new Error("대역 조회 실패"); }; },
    },
    async getQuote({ hours }) {
      const result = await service.getPriceQuote(
        { baseModel: reference("huggingface", SUPPORTED_MODEL), method: "lora", provider: null, region: null, gpuType: null, estimatedHours: hours },
        ctx,
      );
      if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
      return quoteView(result.data);
    },
  };
}

const TEACHER_LLM = "fixture-teacher-llm";
/** 실제 제품의 alternativeModel 조회가 동작하도록 실제 카탈로그 source를 쓴다. HTTP는 아래 대역이 답한다. */
const CATALOG_SOURCE = "huggingface";
const HUB_MODEL_API = "https://huggingface.co/api/models/";

function studentModelIn(system: string | null): string {
  const found = system?.match(/^- modelId: (.+)$/m)?.[1];
  if (!found) throw new Error("시스템 프롬프트에서 학생 모델을 찾지 못했습니다.");
  return found;
}

function scriptedLlmGateway() {
  let connected = true;
  let reply = JSON.stringify({ reply: "대역 응답", recommendations: [] });
  let held: Promise<string> | null = null;
  const unevidenced = new Set<string>();
  const requests: LlmRequest[] = [];

  const script: ScriptedLlm = {
    requests,
    setConnected: (value) => { connected = value; },
    holdNext() {
      let release: (text: string) => void = () => {};
      held = new Promise<string>((resolve) => { release = resolve; });
      return (text) => release(JSON.stringify({ reply: text, recommendations: [] }));
    },
    replyWith(text, opts) {
      const recommendations = opts?.recommend
        ? [{
            kind: "consider_alternative",
            summary: text,
            evidenceRefs: opts.evidence ?? [],
            alternativeModel: { source: CATALOG_SOURCE, modelId: opts.recommend.modelId },
            limitations: null,
          }]
        : [];
      // 제품은 LLM이 적은 근거를 믿지 않고 카탈로그 조회로 근거를 만든다.
      // 따라서 "근거 없음"은 카탈로그에서 이 모델을 확인할 수 없는 상황으로 표현한다.
      if (opts?.recommend) {
        if (opts.evidence?.length) unevidenced.delete(opts.recommend.modelId);
        else unevidenced.add(opts.recommend.modelId);
      }
      reply = JSON.stringify({ reply: text, recommendations });
    },
  };

  const completeChat: TeacherDeps["completeChat"] = async (input) => {
    // 실제 게이트웨이처럼 미연결이면 네트워크 호출 전에 돌려준다.
    if (!connected) return notConnected("선생님 모델", ["FIXTURE_LLM_KEY"]);
    requests.push({
      studentModelId: studentModelIn(input.system),
      teacherModelId: TEACHER_LLM,
      userText: input.messages.at(-1)?.content ?? "",
    });
    const text = held ? await held : reply;
    held = null;
    return ok({ text, provider: "fixture-llm", modelId: TEACHER_LLM, connection: "connected" as const });
  };

  return { script, completeChat, unevidenced };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function hubModelResponse(url: string, unevidenced: Set<string>): Response {
  const modelId = url.slice(HUB_MODEL_API.length).split("/revision/")[0];
  if (unevidenced.has(modelId)) return jsonResponse({ error: "대역 없음" }, 404);
  return jsonResponse({ id: modelId, sha: "a".repeat(40), gated: false, private: false, tags: [], siblings: [] });
}

/** 클라이언트 저장소의 fetch를 라우트 대신 실제 서비스로 보낸다. 그 밖의 네트워크는 실패시킨다. */
function installFetch(deps: TeacherDeps, ctx: RequestContext, unevidenced: Set<string>, responses: TeacherResponse[]) {
  globalThis.fetch = (async (target: string | URL | Request, init?: RequestInit) => {
    const url = String(target);
    if (url.startsWith(HUB_MODEL_API)) return hubModelResponse(url, unevidenced);
    if (url !== "/api/teacher/messages") throw new Error(`테스트에서 허용하지 않은 네트워크 호출: ${url}`);

    const signal = init?.signal ?? undefined;
    const body = TeacherRequest.parse(JSON.parse(String(init?.body)));
    const answer = askTeacherWith(deps, body, ctx).then((result) => {
      if (result.ok) responses.push(result.data);
      return jsonResponse(result);
    });
    return new Promise<Response>((resolve, reject) => {
      signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
      answer.then(resolve, reject);
    });
  }) as typeof fetch;
}

async function untilIdle(): Promise<void> {
  while (useConsultStore.getState().waiting) await new Promise((resolve) => setTimeout(resolve, 1));
}

function toModelRef(model: ModelReference): ModelRef {
  return { source: model.source, modelId: model.modelId, revision: model.revision };
}

async function teacherHarness(initial: ModelRef): Promise<TeacherHarness> {
  process.env.AA_DATA_DIR = tempDir("aa-qa-teacher-");
  const ctx = context();
  const llm = scriptedLlmGateway();
  const responses: TeacherResponse[] = [];
  installFetch({ completeChat: llm.completeChat }, ctx, llm.unevidenced, responses);

  const toReference = (ref: ModelRef) => reference(CATALOG_SOURCE, ref.modelId, ref.revision);

  async function saveSelection(model: ModelRef) {
    const current = await getCurrentAgent(ctx);
    if (!current.ok) throw new Error(current.error.message);
    const saved = await saveCurrentAgent(
      { name: "검증용 학생", selectedModel: toReference(model), avatarAssetId: null, expectedVersion: current.data.agent?.version ?? null },
      ctx,
    );
    if (!saved.ok) throw new Error(saved.error.message);
    useConsultStore.getState().bind(saved.data);
  }

  useConsultStore.getState().bind(null);
  await saveSelection(initial);

  const state = (): TeacherState => {
    const { agent, lines, error } = useConsultStore.getState();
    if (!agent?.selectedModel) throw new Error("선택 모델이 없습니다.");

    const messages: TeacherMessage[] = lines.map((line) => ({
      role: line.role,
      text: line.content,
      connection: line.role === "user" || line.connection === "connected" ? "connected" : "not_connected",
      studentModelId: responses.findLast((item) => item.reply === line.content)?.studentModel?.modelId ?? null,
      teacherModelId: line.teacherModel?.modelId ?? null,
    }));
    // 화면은 이 오류를 연결 필요 안내로 표시한다. 저장소에 고정 답변 줄이 생기지 않는다.
    if (error?.code === "NOT_CONNECTED") {
      messages.push({ role: "teacher", text: error.message, connection: "not_connected", studentModelId: null, teacherModelId: null });
    }

    const alternative = lines
      .flatMap((line) => line.recommendations)
      .filter((item) => item.kind === "consider_alternative" && item.alternativeModel)
      .at(-1);
    return {
      selectedModel: toModelRef(agent.selectedModel),
      messages,
      recommendation: alternative?.alternativeModel
        ? { model: toModelRef(alternative.alternativeModel), evidence: alternative.evidence.map((item) => item.note ?? "") }
        : null,
      attachedArtifactId: null,
    };
  };

  return {
    llm: llm.script,
    session: {
      selectModel: saveSelection,
      attachArtifact: () => { throw new Error("제품에 상담 세션의 결과물 첨부 개념이 없습니다."); },
      async send(text) {
        useConsultStore.getState().send(text);
        await untilIdle();
      },
      state,
    },
  };
}

export const bindings: Bindings = {
  training: trainingHarness,
  pricing: pricingHarness,
  teacher: teacherHarness,
  unsupported: {
    P2: "제품의 PriceProvider에는 지역·조회 시각·실시간 여부 필드가 없고, 성공한 조회는 모두 published_doc으로 나온다. Nebius에 공개 단가 API가 없어 live 경로 자체가 없다.",
    M8: "제품에 상담 세션에 학습 결과물을 첨부하는 개념이 없다(O-6). 빈 동작으로 연결하면 내용 없이 통과한다.",
  },
};
