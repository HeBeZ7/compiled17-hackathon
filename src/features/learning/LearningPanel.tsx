"use client";

import { notConnected, type LearningPanelProps } from "@/shared/contracts";
import { Button, ConnectionNotice, Panel } from "@/shared/ui";
import styles from "./LearningPanel.module.css";

const LEARNING_NOT_CONNECTED = notConnected("학습 준비 기능").error;

/** Placeholder owned by D. */
export function LearningPanel({ onClose }: LearningPanelProps) {
  return (
    <Panel className={styles.panel} role="dialog" aria-label="학습 준비">
      <div className={styles.head}>
        <h2>학습 준비</h2>
        <Button variant="ghost" onClick={onClose}>
          닫기
        </Button>
      </div>
      <ConnectionNotice error={LEARNING_NOT_CONNECTED} />
    </Panel>
  );
}
