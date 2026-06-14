import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

export default function nextConfig(phase: string): NextConfig {
  return {
    distDir: phase === PHASE_DEVELOPMENT_SERVER ? ".next-dev" : ".next",
    allowedDevOrigins: [
      "localhost",
      "127.0.0.1",
      "10.130.178.92"
    ],
    turbopack: {
      root: process.cwd()
    }
  };
}
