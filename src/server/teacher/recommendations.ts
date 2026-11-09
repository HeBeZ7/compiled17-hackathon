import "server-only";
import { z } from "zod";
import { lookupCatalogEntry } from "@/server/catalog";
import {
  isSameModel,
  type BenchmarkScore,
  type CatalogEntry,
  type Evidence,
  type ModelCapabilities,
  type ModelReference,
  type RequestContext,
  type TeacherRecommendation,
} from "@/shared/contracts";
import { benchmarkEvidence, capabilityEvidence, isCitableBenchmark, type EvidenceEntry } from "./prompt";

const RawRecommendation = z.object({
  kind: z.enum(["keep_model", "consider_alternative", "training_direction", "need_more_info"]),
  summary: z.string().min(1),
  evidenceRefs: z.array(z.string()).nullish(),
  alternativeModel: z.object({ source: z.string().min(1), modelId: z.string().min(1) }).nullish(),
  limitations: z.string().nullish(),
});
type RawRecommendation = z.infer<typeof RawRecommendation>;

const RawOutput = z.object({
  reply: z.string().min(1),
  recommendations: z.array(RawRecommendation).max(5).default([]),
});

export interface TeacherOutput {
  reply: string;
  recommendations: RawRecommendation[];
}

function extractJsonObject(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return undefined;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return undefined;
  }
}

/** A reply that does not follow the format is still a real model answer, just without recommendations. */
export function parseTeacherOutput(text: string): TeacherOutput {
  const parsed = RawOutput.safeParse(extractJsonObject(text));
  return parsed.success ? parsed.data : { reply: text.trim(), recommendations: [] };
}

function proposalOnly(now: string): Evidence {
  return {
    level: "ASSISTANT_PROPOSED",
    sourceUrl: null,
    checkedAt: now,
    note: "Teacher model suggestion · not confirmed by external evidence",
  };
}

function excluded(modelId: string, reason: string): TeacherRecommendation {
  return {
    kind: "need_more_info",
    summary: `Alternative model ${modelId} was excluded from recommendations because it has no verifiable evidence`,
    alternativeModel: null,
    evidence: [],
    limitations: reason,
  };
}

function comparisonKey(score: BenchmarkScore): string {
  return JSON.stringify([score.benchmark, score.task, score.dataset, score.conditions, score.unit]);
}

function alternativeEvidence(entry: CatalogEntry): Evidence[] {
  const capabilities = (Object.keys(entry.ref.capabilities) as (keyof ModelCapabilities)[]).flatMap((stage) => {
    const evidence = capabilityEvidence(stage, entry.ref.capabilities[stage]);
    return evidence ? [evidence] : [];
  });
  return [...entry.benchmarks.filter(isCitableBenchmark).map(benchmarkEvidence), ...capabilities];
}

function comparisonLimit(studentEntry: CatalogEntry | null, alternative: CatalogEntry): string | null {
  const student = new Set((studentEntry?.benchmarks ?? []).filter(isCitableBenchmark).map(comparisonKey));
  const comparable = alternative.benchmarks.filter(isCitableBenchmark).some((score) => student.has(comparisonKey(score)));
  return comparable ? null : "No score was measured under the same conditions as the current model so the two cannot be compared directly";
}

function joinLimits(...limits: (string | null | undefined)[]): string | null {
  const present = limits.filter((limit): limit is string => Boolean(limit));
  return present.length ? present.join(" ") : null;
}

async function groundAlternative(
  raw: RawRecommendation,
  student: { model: ModelReference | null; entry: CatalogEntry | null },
  ctx: RequestContext,
): Promise<TeacherRecommendation | null> {
  if (!raw.alternativeModel) return null;
  const { source, modelId } = raw.alternativeModel;

  const lookup = await lookupCatalogEntry({ source, modelId }, ctx);
  if (!lookup.ok) return excluded(modelId, `This model could not be confirmed in the catalog (${lookup.error.code})`);

  const alternative = lookup.data;
  if (student.model && isSameModel(alternative.ref, student.model)) return null;

  const evidence = alternativeEvidence(alternative);
  if (evidence.length === 0) return excluded(modelId, "No score with a recorded source and conditions and no support evidence");

  return {
    kind: "consider_alternative",
    summary: raw.summary,
    alternativeModel: alternative.ref,
    evidence,
    limitations: joinLimits(raw.limitations, comparisonLimit(student.entry, alternative)),
  };
}

/**
 * Turns the model's claims into recommendations the UI may show. Evidence comes
 * only from the server's own records: unknown citations are dropped, and an
 * alternative survives only if the catalog can back it.
 */
export async function groundRecommendations(
  rawItems: RawRecommendation[],
  context: {
    book: EvidenceEntry[];
    studentModel: ModelReference | null;
    studentEntry: CatalogEntry | null;
    now: string;
    ctx: RequestContext;
  },
): Promise<TeacherRecommendation[]> {
  const byRef = new Map(context.book.map((entry) => [entry.ref, entry.evidence]));
  const grounded: TeacherRecommendation[] = [];

  for (const raw of rawItems) {
    if (raw.kind === "consider_alternative") {
      const item = await groundAlternative(raw, { model: context.studentModel, entry: context.studentEntry }, context.ctx);
      if (item) grounded.push(item);
      continue;
    }
    const cited = [...new Set(raw.evidenceRefs ?? [])].flatMap((ref) => {
      const evidence = byRef.get(ref);
      return evidence ? [evidence] : [];
    });
    grounded.push({
      kind: raw.kind,
      summary: raw.summary,
      alternativeModel: null,
      evidence: cited.length ? cited : raw.kind === "need_more_info" ? [] : [proposalOnly(context.now)],
      limitations: raw.limitations ?? null,
    });
  }
  return grounded;
}
