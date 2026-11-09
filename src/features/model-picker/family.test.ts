import { describe, expect, it } from "vitest";
import type { CatalogEntry, ModelCapabilities } from "@/shared/contracts";
import { familyOf, groupByFamily } from "./family";

const claim = { support: "unknown", evidence: null } as const;
const capabilities: ModelCapabilities = {
  listed: claim,
  accessible: claim,
  filesPreparable: claim,
  inference: claim,
  training: claim,
  accountVerified: claim,
};

function entry(modelId: string, publisher: string | null = null, source = "huggingface"): CatalogEntry {
  return {
    ref: { source, publisher, modelId, revision: null, licenseRef: null, capabilities },
    displayName: modelId,
    tags: [],
    benchmarks: [],
  };
}

describe("familyOf", () => {
  it("reads the family from the model name, not the publisher", () => {
    expect(familyOf(entry("Qwen/Qwen2.5-7B-Instruct", "Qwen"))).toEqual({ key: "qwen", name: "Qwen" });
    expect(familyOf(entry("meta-llama/Llama-3.1-8B-Instruct", "meta-llama"))).toEqual({ key: "llama", name: "Llama" });
    expect(familyOf(entry("deepseek-ai/DeepSeek-R1", "deepseek-ai"))).toEqual({ key: "deepseek", name: "DeepSeek" });
    expect(familyOf(entry("google/gemma-2-9b", "google"))).toEqual({ key: "gemma", name: "Gemma" });
  });

  it("is not limited to any list of known families", () => {
    expect(familyOf(entry("openai/whisper-large-v3", "openai")).key).toBe("whisper");
    expect(familyOf(entry("stabilityai/stable-diffusion-3", "stabilityai")).key).toBe("stable");
    expect(familyOf(entry("TinyLlama/TinyLlama-1.1B-Chat", "TinyLlama")).key).toBe("tinyllama");
    expect(familyOf(entry("some-org/Zorblax-9000", "some-org"))).toEqual({ key: "zorblax", name: "Zorblax" });
  });

  it("handles models without a publisher prefix", () => {
    expect(familyOf(entry("bert-base-uncased")).key).toBe("bert");
  });

  it("skips generic leading words instead of forming a family from them", () => {
    expect(familyOf(entry("sentence-transformers/all-MiniLM-L6-v2", "sentence-transformers")).key).toBe("minilm");
    expect(familyOf(entry("org/text-embedding-model-v3")).key).toBe("embedding");
  });

  it("falls back to publisher, then source, when the name has no usable token", () => {
    expect(familyOf(entry("org/gpt-2", "ACME"))).toEqual({ key: "acme", name: "ACME" });
    expect(familyOf(entry("7B", null, "huggingface"))).toEqual({ key: "huggingface", name: "huggingface" });
  });

  it("is deterministic", () => {
    const a = entry("Qwen/Qwen3-235B", "Qwen");
    expect(familyOf(a)).toEqual(familyOf({ ...a }));
  });
});

describe("groupByFamily", () => {
  it("keeps catalog order for families and for their models", () => {
    const items = [
      entry("meta-llama/Llama-3-8B", "meta-llama"),
      entry("Qwen/Qwen2.5-7B", "Qwen"),
      entry("Qwen/Qwen3-14B", "Qwen"),
      entry("deepseek-ai/DeepSeek-V3", "deepseek-ai"),
      entry("meta-llama/Llama-2-70B", "meta-llama"),
    ];
    const families = groupByFamily(items);
    expect(families.map((family) => family.key)).toEqual(["llama", "qwen", "deepseek"]);
    expect(families[1]?.models.map((model) => model.ref.modelId)).toEqual(["Qwen/Qwen2.5-7B", "Qwen/Qwen3-14B"]);
  });

  it("keeps every entry, so grouping can never hide a catalog model", () => {
    const items = [entry("a/Foo-1"), entry("b/Foo-2"), entry("c/Bar-1"), entry("d/Baz-1")];
    const total = groupByFamily(items).reduce((sum, family) => sum + family.models.length, 0);
    expect(total).toBe(items.length);
  });

  it("collects distinct publishers per family", () => {
    const items = [entry("a/Foo-1", "a"), entry("b/Foo-2", "b"), entry("c/Foo-3", "a")];
    expect(groupByFamily(items)[0]?.publishers).toEqual(["a", "b"]);
  });
});
