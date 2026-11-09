import { describe, expect, it } from "vitest";
import type { BenchmarkScore, CapabilityClaim } from "@/shared/contracts";
import { INITIAL_NAV, nextNav, previousNav, retryNav, searchNav } from "./catalogNav";
import { claimView, formatScore, isComparableScore } from "./presentation";

describe("catalog navigation", () => {
  it("walks forward and back through provider cursors", () => {
    const second = nextNav(INITIAL_NAV, "c2");
    const third = nextNav(second, "c3");
    expect(third.cursors[third.index]).toBe("c3");
    const back = previousNav(third);
    expect(back.cursors[back.index]).toBe("c2");
    expect(previousNav(previousNav(back)).index).toBe(0);
  });

  it("drops later cursors when moving forward from an earlier page", () => {
    const back = previousNav(nextNav(nextNav(INITIAL_NAV, "c2"), "c3"));
    expect(nextNav(back, "other").cursors).toEqual([undefined, "c2", "other"]);
  });

  it("returns to the first page on a new search, and stays put on the same one", () => {
    const paged = nextNav(INITIAL_NAV, "c2");
    expect(searchNav(paged, "qwen")).toMatchObject({ query: "qwen", index: 0, cursors: [undefined] });
    expect(searchNav(paged, "")).toBe(paged);
  });

  it("re-runs the same page on retry", () => {
    const paged = nextNav(INITIAL_NAV, "c2");
    const retried = retryNav(paged);
    expect(retried.attempt).toBe(paged.attempt + 1);
    expect(retried.cursors[retried.index]).toBe("c2");
  });
});

describe("capability display", () => {
  const evidence = { level: "DOC_REVIEWED", sourceUrl: null, checkedAt: null, note: null } as const;
  const claim = (support: CapabilityClaim["support"], withEvidence = true): CapabilityClaim => ({
    support,
    evidence: withEvidence ? evidence : null,
  });

  it("keeps yes, no and unknown distinct", () => {
    expect(claimView(claim("yes"))).toEqual({ tone: "ok", label: "Yes" });
    expect(claimView(claim("no"))).toEqual({ tone: "danger", label: "No" });
    expect(claimView(claim("unknown", false))).toEqual({ tone: "unknown", label: "Unknown" });
  });

  it("does not present a yes without evidence as confirmed", () => {
    expect(claimView(claim("yes", false)).tone).toBe("unknown");
  });
});

describe("benchmark display", () => {
  const score: BenchmarkScore = {
    benchmark: "b",
    task: "t",
    dataset: "d",
    conditions: null,
    score: 0,
    unit: "%",
    sourceUrl: "https://example.com/result",
    checkedAt: null,
  };

  it("shows a measured zero as zero and null as not measured", () => {
    expect(formatScore(score)).toBe("0 %");
    expect(formatScore({ ...score, score: null })).toBe("Not measured");
  });

  it("treats a score missing its task, dataset or source as not comparable", () => {
    expect(isComparableScore(score)).toBe(true);
    expect(isComparableScore({ ...score, dataset: null })).toBe(false);
    expect(isComparableScore({ ...score, task: null })).toBe(false);
    expect(isComparableScore({ ...score, sourceUrl: null })).toBe(false);
    expect(isComparableScore({ ...score, score: null })).toBe(false);
  });
});
