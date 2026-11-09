"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { fail, isSameModel, type CatalogEntry, type ModelReference } from "@/shared/contracts";
import { ConnectionNotice } from "@/shared/ui";
import type { GraphicsQuality } from "@/shared/world/quality";
import type { DisplayState } from "./ShowroomCanvas";
import { useFamilyEntries } from "./useFamilyEntries";
import styles from "./Showroom.module.css";

const ShowroomCanvas = dynamic(() => import("./ShowroomCanvas"), { ssr: false });

/** Medium keeps real transmission with a capped pixel ratio. The quality setting lands with the full showroom. */
const SLICE_QUALITY: GraphicsQuality = "medium";

const FAMILY_QUERY = "qwen";
const FAMILY_KEY = "qwen";

function CapMark() {
  return (
    <svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true">
      <path d="M16 6 2 12.5 16 19l14-6.5L16 6Z" fill="#11303A" />
      <path d="M8 16.2v5.6c0 1.6 3.6 3.2 8 3.2s8-1.6 8-3.2v-5.6l-8 3.7-8-3.7Z" fill="#2A6F66" />
      <path d="M28 13.4V22" stroke="#6FC7A5" strokeWidth="2" strokeLinecap="round" />
      <circle cx="28" cy="24" r="2" fill="#6FC7A5" />
    </svg>
  );
}

function SparkMark() {
  return (
    <svg viewBox="0 0 48 48" width="44" height="44" aria-hidden="true">
      <defs>
        <linearGradient id="showroom-spark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#B99CFF" />
          <stop offset="1" stopColor="#6E4BD8" />
        </linearGradient>
      </defs>
      <path
        d="M24 3c2.2 9.4 5.9 15 13.4 18.6 2.4 1.1 2.4 3.7 0 4.8C29.9 30 26.2 35.6 24 45c-2.2-9.4-5.9-15-13.4-18.6-2.4-1.1-2.4-3.7 0-4.8C18.1 18 21.8 12.4 24 3Z"
        fill="url(#showroom-spark)"
      />
      <path d="M24 16.5c.8 3.6 2.3 5.6 5.7 7.5-3.4 1.9-4.9 3.9-5.7 7.5-.8-3.6-2.3-5.6-5.7-7.5 3.4-1.9 4.9-3.9 5.7-7.5Z" fill="#F7F1FF" />
    </svg>
  );
}

function shortRevision(revision: string | null): string {
  return revision ? revision.slice(0, 12) : "Unverified";
}

function DetailPanel({
  familyName,
  models,
  selected,
  onChoose,
  onContinue,
  onShowList,
}: {
  familyName: string;
  models: CatalogEntry[];
  selected: ModelReference | null;
  onChoose: (model: ModelReference) => void;
  onContinue: () => void;
  onShowList: () => void;
}) {
  const [index, setIndex] = useState(0);
  const current = models[Math.min(index, models.length - 1)];
  if (!current) return null;
  const { ref } = current;
  const chosen = selected !== null && isSameModel(selected, ref);
  return (
    <>
      <header className={styles.panelHead}>
        <SparkMark />
        <div>
          <h2>{familyName}</h2>
          <p className={styles.panelSub}>Model family · {models.length} {models.length === 1 ? "model" : "models"} found</p>
        </div>
      </header>
      <label className={styles.modelSelect}>
        Exact model
        <select value={index} onChange={(event) => setIndex(Number(event.target.value))} data-testid="showroom-model-select">
          {models.map((entry, position) => (
            <option key={`${entry.ref.modelId}|${entry.ref.revision ?? ""}`} value={position}>
              {entry.ref.modelId}
            </option>
          ))}
        </select>
      </label>
      <dl className={styles.facts}>
        <div>
          <dt>Model ID</dt>
          <dd data-testid="showroom-model-id">{ref.modelId}</dd>
        </div>
        <div>
          <dt>Revision</dt>
          <dd data-testid="showroom-model-revision">{shortRevision(ref.revision)}</dd>
        </div>
        <div>
          <dt>License</dt>
          <dd>{ref.licenseRef ?? "Unverified"}</dd>
        </div>
      </dl>
      {chosen ? (
        <>
          <p className={styles.chosen} role="status" data-testid="showroom-chosen">
            Chosen for your agent
          </p>
          <button type="button" className={styles.cta} onClick={onContinue} data-testid="showroom-continue">
            Create your character
          </button>
        </>
      ) : (
        <button type="button" className={styles.cta} onClick={() => onChoose(ref)} data-testid="showroom-choose">
          Choose this model
        </button>
      )}
      <button type="button" className={styles.textButton} onClick={onShowList}>
        See support for each stage in List view
      </button>
    </>
  );
}

export function ModelShowroom({
  selected,
  onSelect,
  onContinue,
  onShowList,
  onSearch,
  children,
}: {
  selected: ModelReference | null;
  onSelect: (model: ModelReference) => void;
  onContinue: () => void;
  onShowList: () => void;
  onSearch: (text: string) => void;
  children?: ReactNode;
}) {
  const { result, family, retry } = useFamilyEntries(FAMILY_QUERY, FAMILY_KEY);
  const [hovering, setHovering] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [text, setText] = useState("");
  const labelAnchor = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  const familyChosen = Boolean(selected && family?.models.some((entry) => isSameModel(entry.ref, selected)));
  const displayState: DisplayState = familyChosen ? "selected" : hovering ? "hover" : "idle";

  const focusPanel = useCallback(() => {
    panelRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    panelRef.current?.focus({ preventScroll: true });
  }, []);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (text.trim()) onSearch(text.trim());
  };

  const page = result?.ok ? result.data : null;
  const failedEmpty = page?.freshness === "fetch_failed" && page.items.length === 0;

  return (
    <div className={styles.stage} data-testid="model-showroom" data-display-state={displayState}>
      <ShowroomCanvas
        displayState={displayState}
        quality={SLICE_QUALITY}
        reducedMotion={reducedMotion}
        onDisplayFocus={focusPanel}
        onHoverChange={setHovering}
        labelAnchor={labelAnchor}
      />
      {family && (
        <div ref={labelAnchor} className={styles.plinthLabel} data-testid="showroom-plinth-label">
          <strong>{family.name}</strong>
          <span>Model family</span>
          <button type="button" className={styles.detailsButton} onClick={focusPanel}>
            View details
          </button>
        </div>
      )}
      <div className={styles.overlay}>
        <div className={styles.topRow}>
          <nav className={styles.navPills} aria-label="Agent Academy">
            <span className={styles.brandPill}>
              <CapMark />
              <span className={styles.brandName}>Agent Academy</span>
            </span>
            <ol className={styles.crumbs} aria-label="Steps">
              <li aria-current="step">Choose a model</li>
              <li>Create your character</li>
              <li>Enter the classroom</li>
            </ol>
          </nav>
          <button type="button" className={styles.listToggle} onClick={onShowList} data-testid="showroom-list-toggle">
            List view
          </button>
        </div>

        <header className={styles.headline}>
          <h1>Who will you build with?</h1>
          <p>Find a model that feels like yours</p>
        </header>

        <form className={styles.search} role="search" onSubmit={handleSubmit}>
          <label className={styles.searchField}>
            <span className="sr-only">Search models</span>
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" strokeWidth="2" />
              <path d="m16 16 5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <input
              type="search"
              value={text}
              maxLength={200}
              placeholder="Search models"
              onChange={(event) => setText(event.target.value)}
            />
          </label>
        </form>

        <p className={styles.caption}>
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path d="M8 1c.7 3.2 2 4.9 5.6 7-3.6 2.1-4.9 3.8-5.6 7-.7-3.2-2-4.9-5.6-7C6 5.9 7.3 4.2 8 1Z" fill="currentColor" />
          </svg>
          Display characters are illustrative — create your own avatar next
        </p>

        <aside ref={panelRef} className={styles.panel} tabIndex={-1} aria-label="Model details" data-testid="showroom-panel">
          {result === null ? (
            <p role="status" className={styles.panelStatus}>Checking the catalog</p>
          ) : !result.ok ? (
            <ConnectionNotice error={result.error} onRetry={retry} />
          ) : failedEmpty && page ? (
            <ConnectionNotice error={fail("PROVIDER_ERROR", `Could not read the ${page.source} catalog`, { retryable: true }).error} onRetry={retry} />
          ) : !family ? (
            <div className={styles.panelStatus} role="status" data-testid="showroom-empty">
              <p>No Qwen family models in this catalog response</p>
              <button type="button" className={styles.textButton} onClick={onShowList}>
                Open List view
              </button>
            </div>
          ) : (
            <DetailPanel
              key={family.key}
              familyName={family.name}
              models={family.models}
              selected={selected}
              onChoose={onSelect}
              onContinue={onContinue}
              onShowList={onShowList}
            />
          )}
          {children}
        </aside>
      </div>
    </div>
  );
}
