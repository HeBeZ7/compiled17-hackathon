import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // next dev otherwise rewrites the team-owned root AGENTS.md when it detects a coding agent.
  agentRules: false,
  // Codespaces forwards the private dev port through <name>-<port>.app.github.dev.
  allowedDevOrigins: ["*.app.github.dev"],
  // Lets Playwright run next dev beside a worker's own dev server without sharing .next.
  distDir: process.env.AA_DIST_DIR ?? ".next",
};

export default nextConfig;
