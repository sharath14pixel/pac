import { config } from "dotenv";

// Load env file with override to take precedence over shell env vars.
// DOTENV_PATH lets parallel runs target a sibling file.
const envFile = process.env.DOTENV_PATH ?? ".env.local";
config({ path: envFile, override: true });

export const BITGN_API_KEY = process.env.BITGN_API_KEY ?? "";
export const BENCHMARK_HOST = process.env.BENCHMARK_HOST ?? "https://api.bitgn.com";
export const BENCHMARK_ID = process.env.BENCHMARK_ID ?? "bitgn/pac1-dev";
function resolveDefaultModel(): string {
  if (process.env.MODEL_ID) return process.env.MODEL_ID;
  if (process.env.GEMINI_API_KEY) return "gemini-3.5-flash-lite";
  if (process.env.OPENAI_API_KEY) return "gpt-4o-mini";
  if (process.env.NVIDIA_API_KEY) return "meta/llama-3.3-70b-instruct";
  return "claude-sonnet-4-6";
}

function parsePositiveInt(val: string | undefined, fallback: number): number {
  if (!val) return fallback;
  const parsed = Number.parseInt(val, 10);
  return Number.isNaN(parsed) || parsed <= 0 ? fallback : parsed;
}

export const MODEL_ID = resolveDefaultModel();
export const MAX_STEPS = parsePositiveInt(process.env.MAX_STEPS, 30);
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
export const EXPLORATION_SPIRAL_THRESHOLD = parsePositiveInt(process.env.EXPLORATION_SPIRAL_THRESHOLD, 35);

// Intra-run task parallelism. Default 1 = serial. See src/main.ts processTrial.
// Raise to run multiple trials concurrently within one session.
export const CONCURRENCY = parsePositiveInt(process.env.CONCURRENCY, 1);

// Inter-trial pacing delay in ms to avoid provider RPM rate limit bursts
export const TASK_PACING_MS = parsePositiveInt(process.env.TASK_PACING_MS, 1500);

export const CLI = {
  red: "\x1B[31m",
  green: "\x1B[32m",
  blue: "\x1B[34m",
  yellow: "\x1B[33m",
  dim: "\x1B[2m",
  reset: "\x1B[0m",
} as const;

export function validateEnvironment(): void {
  const missing: string[] = [];
  if (!BITGN_API_KEY) missing.push("BITGN_API_KEY");
  if (!process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY && !process.env.NVIDIA_API_KEY && !process.env.GEMINI_API_KEY) {
    missing.push("GEMINI_API_KEY, ANTHROPIC_API_KEY, or OPENAI_API_KEY");
  }
  if (missing.length > 0) {
    console.error(`${CLI.red}[CONFIG ERROR] Missing required environment variable(s): ${missing.join(", ")}${CLI.reset}`);
    console.error(`Please configure your credentials in .env.local.`);
    process.exit(1);
  }
}

