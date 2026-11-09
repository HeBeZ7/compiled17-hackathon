"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { fail, isSameModel, type CatalogPage, type ModelReference } from "@/shared/contracts";
import { Button, ConnectionNotice, StatusBadge } from "@/shared/ui";
import { detectWebGL } from "@/shared/world/quality";
import { ModelCard } from "./ModelCard";
import { FRESHNESS_VIEW, formatDateTime } from "./presentation";
import { ModelShowroom } from "./showroom/ModelShowroom";
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

export type PickerView = "showroom" | "list";

/**
 * The set and plinth GLBs and the environment map are not baked yet (assets-src/showroom/set_scene.py -- bake),
 * and the scene cannot load without them. Keep this false until those files exist in public/assets/showroom.
 */
const SHOWROOM_ASSETS_READY = false;

function showroomAvailable(): boolean {
  return SHOWROOM_ASSETS_READY && detectWebGL();
}

/** WebGL2 decides the starting view. The flow only mounts in the browser, after the agent has loaded. */
export function initialPickerView(): PickerView {
  return showroomAvailable() ? "showroom" : "list";
}

export function ModelPicker({
  selected,
  onSelect,
  view,
  onViewChange,
  onContinue,
  listHeader,
}: {
  selected: ModelReference | null;
  onSelect: (model: ModelReference) => void;
  view: PickerView;
  onViewChange: (view: PickerView) => void;
  onContinue: () => void;
  /** Selected model summary and warnings, shown above the DOM list. */
  listHeader?: ReactNode;
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

  if (view === "showroom") {
    return (
      <ModelShowroom
        selected={selected}
        onSelect={onSelect}
        onContinue={onContinue}
        onShowList={() => onViewChange("list")}
        onSearch={(value) => {
          setText(value);
          search(value);
          onViewChange("list");
        }}
      />
    );
  }

  const page = result?.ok ? result.data : null;
  // A failed fetch with nothing to show is an error, not "no such model".
  const failedEmpty = page?.freshness === "fetch_failed" && page.items.length === 0;

  return (
    <div className={styles.picker}>
      <div className={styles.viewRow}>
        <h3 className={styles.listTitle}>All models</h3>
        {showroomAvailable() && (
          <Button variant="secondary" onClick={() => onViewChange("showroom")} data-testid="showroom-toggle">
            Showroom
          </Button>
        )}
      </div>
      {listHeader}
      <form className={styles.searchRow} role="search" onSubmit={handleSubmit}>
        <label className={styles.searchLabel}>
          Search models
          <input
            type="search"
            value={text}
            maxLength={200}
            placeholder="Search by name or publisher"
            onChange={(event) => handleChange(event.target.value)}
          />
        </label>
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>

      <p className={styles.muted}>Being listed does not mean a model can be trained  Each model shows what has been confirmed for every stage</p>

      <div className={styles.results} ref={resultsRef} aria-busy={result === null}>
        {result === null ? (
          <>
            <p role="status">Checking the catalog</p>
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
            error={fail("PROVIDER_ERROR", `Could not read the ${page.source} catalog`, { retryable: true }).error}
            onRetry={retry}
          />
        ) : page && page.items.length === 0 ? (
          <div className={styles.empty} role="status" data-testid="catalog-empty">
            <p>{query ? `No models match ${query}` : "No models to show"}</p>
            {query && <p className={styles.muted}>Try another name or publisher</p>}
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
            <nav className={styles.pager} aria-label="Model list pages">
              <Button variant="ghost" disabled={pageNumber === 1} onClick={() => movePage(previous)}>
                Previous
              </Button>
              <span>Page {pageNumber}</span>
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
                Next
              </Button>
            </nav>
          </>
        ) : null}
      </div>
    </div>
  );
}
