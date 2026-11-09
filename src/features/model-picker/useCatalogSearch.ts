"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/shared/api";
import type { CatalogPage, ServiceResult } from "@/shared/contracts";
import { INITIAL_NAV, nextNav, previousNav, retryNav, searchNav } from "./catalogNav";

const PAGE_SIZE = 12;

export function useCatalogSearch() {
  const [nav, setNav] = useState(INITIAL_NAV);
  const [outcome, setOutcome] = useState<{ key: string; result: ServiceResult<CatalogPage> } | null>(null);

  const { query, attempt } = nav;
  const cursor = nav.cursors[nav.index];
  const requestKey = JSON.stringify([query, cursor, attempt]);

  useEffect(() => {
    const controller = new AbortController();
    void api.catalog.search({ query, cursor, limit: PAGE_SIZE }, controller.signal).then((result) => {
      if (!controller.signal.aborted) setOutcome({ key: requestKey, result });
    });
    return () => controller.abort();
  }, [query, cursor, requestKey]);

  // A result for an older request counts as still loading, so it can never be shown for this one.
  const result = outcome?.key === requestKey ? outcome.result : null;

  return {
    query,
    pageNumber: nav.index + 1,
    result,
    search: useCallback((text: string) => setNav((current) => searchNav(current, text)), []),
    next: useCallback((nextCursor: string) => setNav((current) => nextNav(current, nextCursor)), []),
    previous: useCallback(() => setNav(previousNav), []),
    retry: useCallback(() => setNav(retryNav), []),
  };
}
