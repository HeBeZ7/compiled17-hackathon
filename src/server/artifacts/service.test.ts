import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COLLECTIONS, createStore, type Store } from "@/server/store/store";
import { fail, type ModelArtifact, type RequestContext } from "@/shared/contracts";
import { createArtifactService, type ArtifactRecord, type RuntimeProvider } from "./service";

const ctx: RequestContext = { ownerId: "o", signal: new AbortController().signal };
const ID = "art_run";
const NOW = "2026-11-09T00:00:00.000Z";
const claim = { support: "unknown" as const, evidence: null };

const artifact: ModelArtifact = {
  artifactId: ID,
  runId: "run",
  baseModel: {
    source: "huggingface",
    publisher: "a",
    modelId: "a/b",
    revision: null,
    licenseRef: null,
    capabilities: { listed: claim, accessible: claim, filesPreparable: claim, inference: claim, training: claim, accountVerified: claim },
  },
  kind: "lora_adapter",
  providerArtifactId: "ft:a/b:ckpt",
  uri: null,
  existenceVerified: true,
  verifiedAt: NOW,
};

let dir: string;
let store: Store;
let listModels: ReturnType<typeof vi.fn>;
let chat: ReturnType<typeof vi.fn>;
let configured: boolean;
let service: ReturnType<typeof createArtifactService>;

function seed(overrides: Partial<ModelArtifact> = {}) {
  const record: ArtifactRecord = {
    artifact: { ...artifact, ...overrides },
    runtime: { artifactId: ID, state: "not_loaded", responseVerifiedAt: null, error: null, updatedAt: NOW },
    fileIds: ["f"],
  };
  store.put(COLLECTIONS.artifacts, ctx.ownerId, ID, record);
}

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "aa-art-"));
  store = createStore(path.join(dir, "t.sqlite"));
  configured = true;
  listModels = vi.fn().mockResolvedValue({ ok: true, data: [{ id: "ft:a/b:ckpt", status: "active" }] });
  chat = vi.fn().mockResolvedValue({ ok: true, data: "real reply" });
  const runtime: RuntimeProvider = {
    requiredConfig: ["NEBIUS_API_KEY"],
    isConfigured: () => configured,
    listModels: listModels as RuntimeProvider["listModels"],
    chat: chat as RuntimeProvider["chat"],
  };
  service = createArtifactService({ store, runtime });
});

afterEach(() => {
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("loadArtifactRuntime", () => {
  it("is NOT_CONNECTED by key name when unconfigured", async () => {
    configured = false;
    seed();
    const result = await service.loadArtifactRuntime(ID, ctx);
    expect(!result.ok && result.error).toMatchObject({ code: "NOT_CONNECTED", requiredConfig: ["NEBIUS_API_KEY"] });
  });

  it("does not call a model name the provider does not list", async () => {
    seed();
    listModels.mockResolvedValue({ ok: true, data: [{ id: "other", status: "active" }] });
    const result = await service.loadArtifactRuntime(ID, ctx);
    expect(result.ok && result.data).toMatchObject({ state: "not_loaded", responseVerifiedAt: null, error: { code: "NOT_CONNECTED" } });
    expect(chat).not.toHaveBeenCalled();
  });

  it("marks loaded only after a real generated response", async () => {
    seed();
    const result = await service.loadArtifactRuntime(ID, ctx);
    expect(result.ok && result.data.state).toBe("loaded");
    expect(result.ok && result.data.responseVerifiedAt).toEqual(expect.any(String));
  });

  it("records load_failed when the probe fails", async () => {
    seed();
    chat.mockResolvedValue({ ok: false, error: fail("PROVIDER_ERROR", "x").error, outcome: "rejected" });
    const result = await service.loadArtifactRuntime(ID, ctx);
    expect(result.ok && result.data).toMatchObject({ state: "load_failed", responseVerifiedAt: null });
  });

  it("refuses an artifact whose files were never observed", async () => {
    seed({ existenceVerified: false });
    const result = await service.loadArtifactRuntime(ID, ctx);
    expect(!result.ok && result.error.code).toBe("BLOCKED");
    expect(listModels).not.toHaveBeenCalled();
  });
});

describe("runInference", () => {
  const input = { artifactId: ID, messages: [{ role: "user" as const, content: "hi" }] };

  it("refuses until the runtime is loaded", async () => {
    seed();
    const result = await service.runInference(input, ctx);
    expect(!result.ok && result.error.code).toBe("BLOCKED");
    expect(chat).not.toHaveBeenCalled();
  });

  it("answers from the artifact's provider model once loaded", async () => {
    seed();
    await service.loadArtifactRuntime(ID, ctx);
    const result = await service.runInference(input, ctx);
    expect(result.ok && result.data).toMatchObject({ text: "real reply", connection: "connected" });
    expect(chat).toHaveBeenLastCalledWith("ft:a/b:ckpt", input.messages, expect.any(Number), ctx.signal);
  });

  it("hides artifacts from other owners", async () => {
    seed();
    const result = await service.getArtifact(ID, { ...ctx, ownerId: "other" });
    expect(!result.ok && result.error.code).toBe("NOT_FOUND");
  });
});
