"use client";

import type { ApiError, ApiErrorCode } from "@/shared/contracts";
import { Button } from "./Button";
import styles from "./ConnectionNotice.module.css";
import { StatusBadge, type StatusTone } from "./StatusBadge";

function badgeFor(code: ApiErrorCode): { tone: StatusTone; label: string } {
  switch (code) {
    case "NOT_CONNECTED":
      return { tone: "warn", label: "연결 필요" };
    case "BLOCKED":
      return { tone: "warn", label: "준비 필요" };
    case "STATUS_UNKNOWN":
      return { tone: "unknown", label: "상태 불명" };
    default:
      return { tone: "danger", label: "문제 발생" };
  }
}

export function ConnectionNotice({ error, onRetry }: { error: ApiError; onRetry?: () => void }) {
  const { tone, label } = badgeFor(error.code);
  return (
    <div className={styles.notice} role="status" data-testid="connection-notice" data-code={error.code}>
      <StatusBadge tone={tone}>{label}</StatusBadge>
      <p>{error.message}</p>
      {error.requiredConfig.length > 0 && (
        <p className={styles.config}>
          필요한 설정: <code>{error.requiredConfig.join(", ")}</code>
        </p>
      )}
      {onRetry && error.retryable && (
        <Button variant="secondary" onClick={onRetry}>
          다시 시도
        </Button>
      )}
    </div>
  );
}
