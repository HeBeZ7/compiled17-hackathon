"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { detectWebGL } from "@/shared/world/quality";
import styles from "./LandingStage.module.css";

const LandingScene = dynamic(() => import("./LandingScene").then((module) => module.LandingScene), { ssr: false });

export function LandingStage() {
  const [webgl, setWebgl] = useState<boolean | null>(null);

  useEffect(() => {
    setWebgl(detectWebGL());
  }, []);

  return (
    <div className={styles.stage} aria-hidden="true">
      {webgl && <LandingScene />}
      <div className={styles.quiet} />
    </div>
  );
}
