"use client";

import type { ApiError, ApiErrorCode } from "@/shared/contracts";
import { Button } from "./Button";
import styles from "./ConnectionNotice.module.css";
import { StatusBadge, type StatusTone } from "./StatusBadge";

function badgeFor(code: ApiErrorCode): { tone: StatusTone; label: string } {
  switch (code) {
    case "NOT_CONNECTED":
      return { tone: "warn", label: "Not connected" };
    case "BLOCKED":
      return { tone: "warn", label: "Needs setup" };
    case "STATUS_UNKNOWN":
      return { tone: "unknown", label: "Status unknown" };
    default:
      return { tone: "danger", label: "Something went wrong" };
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
          Required settings: <code>{error.requiredConfig.join(", ")}</code>
        </p>
      )}
      {onRetry && error.retryable && (
        <Button variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
