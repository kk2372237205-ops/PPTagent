import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";
import { networkInterfaces } from "os";

const fixedDevOrigins = [
  "localhost",
  "127.0.0.1",
  "10.130.178.92",
  "192.168.128.1"
];

function isPrivateIpv4(address: string) {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }

  const [first, second] = parts;
  return (
    first === 10 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

function getDevOrigins() {
  const detectedOrigins = Object.values(networkInterfaces())
    .flatMap((interfaces) => interfaces ?? [])
    .filter((network) => network.family === "IPv4" && !network.internal && isPrivateIpv4(network.address))
    .map((network) => network.address);

  return Array.from(new Set([...fixedDevOrigins, ...detectedOrigins]));
}

export default function nextConfig(phase: string): NextConfig {
  return {
    distDir: phase === PHASE_DEVELOPMENT_SERVER ? ".next-dev" : ".next",
    devIndicators: false,
    allowedDevOrigins: getDevOrigins(),
    turbopack: {
      root: process.cwd()
    }
  };
}
