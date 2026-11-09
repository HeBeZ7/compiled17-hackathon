"use client";

import dynamic from "next/dynamic";
import { useSyncExternalStore } from "react";
import { detectWebGL } from "@/shared/world/quality";
import styles from "./LandingStage.module.css";

const LandingScene = dynamic(() => import("./LandingScene").then((module) => module.LandingScene), { ssr: false });

const subscribeNever = () => () => {};

let webglSupport: boolean | undefined;
function cachedWebGL(): boolean {
  webglSupport ??= detectWebGL();
  return webglSupport;
}

export function LandingStage() {
  const webgl = useSyncExternalStore(subscribeNever, cachedWebGL, () => false);

  return (
    <div className={styles.stage} aria-hidden="true">
      {webgl && <LandingScene />}
      <div className={styles.quiet} />
    </div>
  );
}
