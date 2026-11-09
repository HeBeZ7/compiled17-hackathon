"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { OnboardingFlow } from "@/features/onboarding";
import type { AgentProfile } from "@/shared/contracts";
import { useAppStore } from "@/shared/state/appStore";
import { ConnectionNotice } from "@/shared/ui";
import styles from "./CreateScreen.module.css";

export function CreateScreen() {
  const router = useRouter();
  const agent = useAppStore((state) => state.agent);
  const agentLoad = useAppStore((state) => state.agentLoad);
  const agentError = useAppStore((state) => state.agentError);
  const loadAgent = useAppStore((state) => state.loadAgent);
  const setAgent = useAppStore((state) => state.setAgent);

  useEffect(() => {
    if (useAppStore.getState().agentLoad !== "ready") void loadAgent();
  }, [loadAgent]);

  const handleComplete = (saved: AgentProfile) => {
    setAgent(saved);
    router.push("/classroom");
  };

  return (
    <main className={styles.main}>
      {agentLoad === "failed" && agentError ? (
        // Without the saved profile, the flow could not tell a new agent from an existing one.
        <ConnectionNotice error={agentError} onRetry={() => void loadAgent()} />
      ) : agentLoad === "ready" ? (
        <OnboardingFlow agent={agent} onComplete={handleComplete} />
      ) : (
        <p role="status">Loading your agent</p>
      )}
    </main>
  );
}
