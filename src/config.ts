import { config } from "dotenv";

// Load env file with override to take precedence over shell env vars.
// DOTENV_PATH lets parallel runs target a sibling file.
const envFile = process.env.DOTENV_PATH ?? ".env.local";
config({ path: envFile, override: true });

export const BITGN_API_KEY = process.env.BITGN_API_KEY ?? "";
export const BENCHMARK_HOST = process.env.BENCHMARK_HOST ?? "https://api.bitgn.com";
export const BENCHMARK_ID = process.env.BENCHMARK_ID ?? "bitgn/pac1-dev";
export const MODEL_ID = process.env.MODEL_ID ?? "claude-sonnet-4-6";
export const MAX_STEPS = Number(process.env.MAX_STEPS ?? "30");
export const ENABLE_SECURITY_SCAN = process.env.ENABLE_SECURITY_SCAN !== "false";
export const VERBOSE = process.env.VERBOSE === "true";

// ── Track-B hardening feature flags (all default ON, set "false" to disable)
// Each flag controls one independent defense layer. Flip off to rollback a
// single layer without a code change.
export const ENABLE_PATH_GUARD = process.env.ENABLE_PATH_GUARD !== "false";
export const ENABLE_PII_REFUSAL = process.env.ENABLE_PII_REFUSAL !== "false";
export const ENABLE_REFS_VALIDATION = process.env.ENABLE_REFS_VALIDATION !== "false";
// Strict mode: default OFF. When off, refs validation only WARNS and never
// blocks report_completion. When on, unknown refs are rejected up to
// REFS_REJECTION_CAP times per task. Opt-in because false positives can cost
// score — warn-only captures the signal with zero regression risk.
export const ENABLE_REFS_VALIDATION_STRICT = process.env.ENABLE_REFS_VALIDATION_STRICT === "true";
export const ENABLE_DESTRUCTIVE_BRAKE = process.env.ENABLE_DESTRUCTIVE_BRAKE !== "false";
export const ENABLE_SECRET_REDACTION = process.env.ENABLE_SECRET_REDACTION !== "false";

// Exploration-spiral brake threshold. A hardcoded cap was too tight for
// read-heavy tasks like account lookups — configurable per run so it can be
// tuned without a code change.
export const EXPLORATION_SPIRAL_THRESHOLD = Number(process.env.EXPLORATION_SPIRAL_THRESHOLD ?? "35");

// Intra-run task parallelism. Default 1 = serial. See src/main.ts processTrial.
// Raise to run multiple trials concurrently within one session.
export const CONCURRENCY = Math.max(1, Number(process.env.CONCURRENCY ?? "1"));

export const CLI = {
  red: "\x1B[31m",
  green: "\x1B[32m",
  blue: "\x1B[34m",
  yellow: "\x1B[33m",
  dim: "\x1B[2m",
  reset: "\x1B[0m",
} as const;
