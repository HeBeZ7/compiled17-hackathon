import Link from "next/link";
import styles from "./AppHeader.module.css";

export type AppStep = "intro" | "create" | "classroom";

const STEPS: { id: AppStep; label: string }[] = [
  { id: "intro", label: "소개" },
  { id: "create", label: "에이전트 만들기" },
  { id: "classroom", label: "교실" },
];

export function AppHeader({ current }: { current: AppStep }) {
  const currentIndex = STEPS.findIndex((step) => step.id === current);
  return (
    <header className={styles.header}>
      <Link href="/" className={styles.brand}>
        Agent Academy
      </Link>
      <ol className={styles.steps} aria-label="진행 단계">
        {STEPS.map((step, index) => (
          <li
            key={step.id}
            className={styles.step}
            data-state={index === currentIndex ? "current" : index < currentIndex ? "done" : "todo"}
            aria-current={index === currentIndex ? "step" : undefined}
          >
            <span className={styles.number} aria-hidden="true">
              {index + 1}
            </span>
            {step.label}
          </li>
        ))}
      </ol>
    </header>
  );
}
