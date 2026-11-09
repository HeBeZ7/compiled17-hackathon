import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // next dev otherwise rewrites the team-owned root AGENTS.md when it detects a coding agent.
  agentRules: false,
  // Codespaces forwards the private dev port through <name>-<port>.app.github.dev.
  allowedDevOrigins: ["*.app.github.dev"],
  // Lets Playwright run next dev beside a worker's own dev server without sharing .next.
  distDir: process.env.AA_DIST_DIR ?? ".next",
  // An always-defined value lets the bundler drop test-only code from normal builds.
  env: { NEXT_PUBLIC_AA_TEST_MODE: process.env.NEXT_PUBLIC_AA_TEST_MODE ?? "0" },
};

export default nextConfig;
