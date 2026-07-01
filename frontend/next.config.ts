import type { NextConfig } from "next";
import path from "node:path";

// Load the repo-root .env (single source of truth) so the server-side API
// client gets API_KEY / API_BASE_URL without duplicating them in frontend/.
// Existing process.env values win; missing file = open API, also fine.
try {
  process.loadEnvFile(path.resolve(process.cwd(), "../.env"));
} catch {
  // no root .env — run without it
}

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;
