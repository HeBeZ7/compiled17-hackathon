"use client";

import { useEffect, useState } from "react";
import { api } from "@/shared/api";
import type { CatalogPage, OnboardingFlowProps, ServiceResult } from "@/shared/contracts";
import { ButtonLink, ConnectionNotice, Panel, StatusBadge } from "@/shared/ui";
import styles from "./OnboardingFlow.module.css";

/** Placeholder owned by C: exercises the catalog API without inventing a model list. */
export function OnboardingFlow({ agent }: OnboardingFlowProps) {
  const [catalog, setCatalog] = useState<ServiceResult<CatalogPage> | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void api.catalog.search({ limit: 20 }, controller.signal).then((result) => {
      if (!controller.signal.aborted) setCatalog(result);
    });
    return () => controller.abort();
  }, [attempt]);

  const retry = () => {
    setCatalog(null);
    setAttempt((value) => value + 1);
  };

  return (
    <Panel className={styles.flow}>
      <StatusBadge tone="warn">임시 화면</StatusBadge>
      <h1>에이전트 만들기</h1>
      <p>모델 선택과 이름·외형 입력은 아직 만들어지지 않았습니다.</p>
      {agent && <p>저장된 에이전트: {agent.name}</p>}

      {catalog === null ? (
        <p role="status">모델 목록을 확인하는 중입니다.</p>
      ) : catalog.ok ? (
        <p role="status">카탈로그에서 모델 {catalog.data.items.length}개를 받았습니다.</p>
      ) : (
        <ConnectionNotice error={catalog.error} onRetry={retry} />
      )}

      <ButtonLink href="/classroom" variant="secondary">
        에이전트 없이 교실 보기
      </ButtonLink>
    </Panel>
  );
}
