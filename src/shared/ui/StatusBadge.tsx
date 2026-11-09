import type { ReactNode } from "react";
import type { ConnectionState } from "@/shared/contracts";
import styles from "./StatusBadge.module.css";

export type StatusTone = "ok" | "warn" | "danger" | "unknown";

export function StatusBadge({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  return <span className={`${styles.badge} ${styles[tone]}`}>{children}</span>;
}

const CONNECTION_BADGE: Record<ConnectionState, { tone: StatusTone; label: string }> = {
  connected: { tone: "ok", label: "연결됨" },
  not_connected: { tone: "warn", label: "연결 필요" },
  test_double: { tone: "danger", label: "테스트 대역" },
  unknown: { tone: "unknown", label: "확인되지 않음" },
};

export function ConnectionBadge({ state }: { state: ConnectionState }) {
  const { tone, label } = CONNECTION_BADGE[state];
  return <StatusBadge tone={tone}>{label}</StatusBadge>;
}
