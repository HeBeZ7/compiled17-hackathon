// BUILD_PLAN §5·§8에서 유도한 검증용 포트. 제품 export 이름이 아니다.
// A가 계약을 고정하면 tests/support/bindings.product.ts 한 곳에서 실제 서비스에 연결한다.

export type TrainingState =
  | "draft" | "validating" | "ready" | "blocked" | "submitting" | "queued" | "running"
  | "cancel_requested" | "canceled" | "status_unknown" | "verifying_artifact" | "completed" | "failed";

export interface RunView {
  runId: string;
  requestKey: string;
  providerJobId: string | null;
  status: TrainingState;
  pollError: string | null;
  blockedReasons: string[];
  artifactId: string | null;
  trainingCompleted: boolean;
  runtimeReady: boolean;
  runtimeError: string | null;
  evaluationResult: unknown | null;
}

export type ProviderJobState = "queued" | "running" | "succeeded" | "failed" | "canceled";

/** 공급자 테스트 대역. 실제 공급자 호출이 아니다. */
export interface ScriptedProvider {
  counts: { create: number; cancel: number };
  scriptCreate(outcome: "accepted" | "timeout" | "rejected"): void;
  setJob(state: ProviderJobState): void;
  failNextPoll(): void;
  setArtifact(outcome: "present" | "missing"): void;
  setRuntime(outcome: "responds" | "load_error"): void;
  /** timeout으로 응답을 못 받았지만 공급자 쪽에 작업이 실제 생긴 상황을 드러낸다. */
  revealLostJob(): void;
}

export interface TrainingPort {
  submit(input: { requestKey: string; spec: "valid" | "missing_data" | "unsupported_model" }): Promise<RunView>;
  refresh(runId: string): Promise<RunView>;
  cancel(runId: string): Promise<RunView>;
  loadResult(runId: string): Promise<RunView>;
}

export interface TrainingHarness {
  provider: ScriptedProvider;
  service: TrainingPort;
  /** 프로세스 재시작을 흉내 낸다. 같은 저장소로 서비스를 새로 만든다. */
  restart(): Promise<TrainingPort>;
}

export type Freshness = "live" | "cached" | "published_doc" | "fetch_failed";

export interface QuoteView {
  provider: string | null;
  region: string | null;
  currency: string | null;
  unit: string | null;
  unitPrice: number | null;
  estimatedTotal: number | null;
  queriedAt: string | null;
  source: string | null;
  cached: boolean;
  freshness: Freshness;
  excludedCosts: string[] | null;
}

export interface LivePrice {
  provider: string; region: string; currency: string; unit: string;
  unitPrice: number; queriedAt: string; source: string;
}

export interface ScriptedPriceSource {
  respondLive(price: LivePrice): void;
  respondPublishedDoc(price: LivePrice): void;
  respondPartial(price: Partial<LivePrice>): void;
  fail(): void;
}

export interface PricingHarness {
  source: ScriptedPriceSource;
  getQuote(input: { hours: number | null }): Promise<QuoteView>;
}

export interface ModelRef { source: string; modelId: string; revision: string | null }

export interface TeacherMessage {
  role: "teacher" | "user";
  text: string;
  connection: "connected" | "not_connected";
  studentModelId: string | null;
  teacherModelId: string | null;
}

export interface LlmRequest { studentModelId: string; teacherModelId: string; userText: string }

export interface ScriptedLlm {
  requests: LlmRequest[];
  setConnected(connected: boolean): void;
  /** 다음 호출을 보류한다. 반환 함수로 지정 문구를 응답한다. */
  holdNext(): (reply: string) => void;
  replyWith(reply: string, opts?: { recommend?: ModelRef; evidence?: string[] }): void;
}

export interface TeacherState {
  selectedModel: ModelRef;
  messages: TeacherMessage[];
  recommendation: { model: ModelRef; evidence: string[] } | null;
  attachedArtifactId: string | null;
}

export interface TeacherPort {
  selectModel(ref: ModelRef): Promise<void>;
  attachArtifact(artifactId: string): void;
  send(text: string): Promise<void>;
  state(): TeacherState;
}

export interface TeacherHarness { llm: ScriptedLlm; session: TeacherPort }

export interface Bindings {
  training?: () => Promise<TrainingHarness>;
  pricing?: () => Promise<PricingHarness>;
  teacher?: (initial: ModelRef) => Promise<TeacherHarness>;
}
