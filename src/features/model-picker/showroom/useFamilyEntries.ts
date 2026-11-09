"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/shared/api";
import type { CatalogPage, ServiceResult } from "@/shared/contracts";
import { groupByFamily, type ModelFamily } from "../family";

const FAMILY_PAGE_SIZE = 24;

/**
 * Fetches real catalog entries for one display family. The search query is only
 * how the family is found: membership is decided by groupByFamily on the result.
 */
export function useFamilyEntries(query: string, familyKey: string) {
  const [attempt, setAttempt] = useState(0);
  const [outcome, setOutcome] = useState<{ key: string; result: ServiceResult<CatalogPage> } | null>(null);
  const requestKey = JSON.stringify([query, attempt]);

  useEffect(() => {
    const controller = new AbortController();
    void api.catalog.search({ query, limit: FAMILY_PAGE_SIZE }, controller.signal).then((result) => {
      if (!controller.signal.aborted) setOutcome({ key: requestKey, result });
    });
    return () => controller.abort();
  }, [query, requestKey]);

  const result = outcome?.key === requestKey ? outcome.result : null;
  const family: ModelFamily | null = useMemo(() => {
    if (!result?.ok) return null;
    return groupByFamily(result.data.items).find((candidate) => candidate.key === familyKey) ?? null;
  }, [result, familyKey]);

  return { result, family, retry: useCallback(() => setAttempt((value) => value + 1), []) };
}
