"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { fail, isSameModel, type CatalogPage, type ModelReference } from "@/shared/contracts";
import { Button, ConnectionNotice, StatusBadge } from "@/shared/ui";
import { ModelCard } from "./ModelCard";
import { FRESHNESS_VIEW, formatDateTime } from "./presentation";
import { useCatalogSearch } from "./useCatalogSearch";
import styles from "./ModelPicker.module.css";

const SEARCH_DELAY_MS = 300;
const SKELETON_CARDS = [0, 1, 2, 3];

function PageSource({ page }: { page: CatalogPage }) {
  const view = FRESHNESS_VIEW[page.freshness];
  return (
    <p className={styles.provenance} data-testid="catalog-provenance">
      <StatusBadge tone={view.tone}>{view.label}</StatusBadge>
      <span>
        {page.source} · {formatDateTime(page.fetchedAt)}
      </span>
    </p>
  );
}

export function ModelPicker({
  selected,
  onSelect,
}: {
  selected: ModelReference | null;
  onSelect: (model: ModelReference) => void;
}) {
  const { query, pageNumber, result, search, next, previous, retry } = useCatalogSearch();
  const [text, setText] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const resultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  const handleChange = (value: string) => {
    setText(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => search(value.trim()), SEARCH_DELAY_MS);
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    clearTimeout(timer.current);
    search(text.trim());
  };

  const movePage = (move: () => void) => {
    move();
    resultsRef.current?.scrollIntoView({ block: "start" });
  };

  const page = result?.ok ? result.data : null;
  // A failed fetch with nothing to show is an error, not "no such model".
  const failedEmpty = page?.freshness === "fetch_failed" && page.items.length === 0;

  return (
    <div className={styles.picker}>
      <form className={styles.searchRow} role="search" onSubmit={handleSubmit}>
        <label className={styles.searchLabel}>
          모델 검색
          <input
            type="search"
            value={text}
            maxLength={200}
            placeholder="이름이나 공급처로 찾아보세요"
            onChange={(event) => handleChange(event.target.value)}
          />
        </label>
        <Button type="submit" variant="secondary">
          찾기
        </Button>
      </form>

      <p className={styles.muted}>목록에 있다고 바로 학습할 수 있는 것은 아니에요. 모델마다 확인된 단계를 함께 보여 드립니다.</p>

      <div className={styles.results} ref={resultsRef} aria-busy={result === null}>
        {result === null ? (
          <>
            <p role="status">모델 목록을 확인하는 중입니다.</p>
            <div className={styles.grid} aria-hidden="true">
              {SKELETON_CARDS.map((card) => (
                <div key={card} className={styles.skeleton} />
              ))}
            </div>
          </>
        ) : !result.ok ? (
          <ConnectionNotice error={result.error} onRetry={retry} />
        ) : failedEmpty ? (
          <ConnectionNotice
            error={fail("PROVIDER_ERROR", `${page.source} 목록을 조회하지 못했습니다.`, { retryable: true }).error}
            onRetry={retry}
          />
        ) : page && page.items.length === 0 ? (
          <div className={styles.empty} role="status" data-testid="catalog-empty">
            <p>{query ? `‘${query}’에 맞는 모델을 찾지 못했어요.` : "표시할 모델이 없어요."}</p>
            {query && <p className={styles.muted}>다른 이름이나 공급처로 찾아보세요.</p>}
          </div>
        ) : page ? (
          <>
            <PageSource page={page} />
            <div className={styles.grid}>
              {page.items.map((entry) => (
                <ModelCard
                  key={`${entry.ref.source}|${entry.ref.modelId}|${entry.ref.revision ?? ""}`}
                  entry={entry}
                  selected={selected !== null && isSameModel(selected, entry.ref)}
                  onSelect={() => onSelect(entry.ref)}
                />
              ))}
            </div>
            <nav className={styles.pager} aria-label="모델 목록 페이지">
              <Button variant="ghost" disabled={pageNumber === 1} onClick={() => movePage(previous)}>
                이전
              </Button>
              <span>{pageNumber}쪽</span>
              <Button
                variant="ghost"
                disabled={page.nextCursor === null}
                onClick={() => {
                  if (page.nextCursor !== null) {
                    const cursor = page.nextCursor;
                    movePage(() => next(cursor));
                  }
                }}
              >
                다음
              </Button>
            </nav>
          </>
        ) : null}
      </div>
    </div>
  );
}
