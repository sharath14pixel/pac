// ── Per-task run metrics (H4 — Run-Metrics JSONL) ───────────────────
//
// Pure, self-contained module. Appends one JSON line per task to a
// date-partitioned JSONL file under `./.bitgn/runs/YYYY-MM-DD.jsonl`
// (override with RUN_METRICS_PATH).
//
// Scope: main.ts-level metrics only. No agent.ts surgery. Captures
// trialId/taskId/timing/score/error/model — enough to answer post-run:
//   - which tasks scored < 1
//   - which tasks took > N seconds
//   - when did agent errors happen
//   - which model/run
//
// Missing from v0 (would need agent.ts changes): steps, tool counts,
// completion outcome enum, stagnation/spiral hit counts.
//
// Rollback: `rm src/metrics.ts src/main-instrumented.ts` → done.
//
// Error handling: writes NEVER throw into the caller. If the write
// fails, we log to stderr and move on — metrics must not break the
// agent path during competition.

import { mkdir, appendFile } from "node:fs/promises";

const DEFAULT_BASE_PATH = process.env.RUN_METRICS_PATH ?? ".bitgn/runs";

export interface TaskMetric {
  /** Schema version — bump on breaking changes. */
  schema: 1;
  /** When the record was written. ISO 8601. */
  recorded_at: string;
  /** BitGN run_id (session mode only) or null for playground. */
  run_id: string | null;
  /** BitGN trial_id — unique per attempt. */
  trial_id: string;
  /** Task identifier (e.g. "t01"). */
  task_id: string;
  /** When runAgent() was invoked. ISO 8601. */
  started_at: string;
  /** When runAgent() returned. ISO 8601. */
  ended_at: string;
  /** End − start, in ms. Includes retries and LLM wait time. */
  duration_ms: number;
  /** playground = single-task practice; session = full scored run. */
  session_type: "playground" | "session";
  /** MODEL_ID env var value at the time of the run. */
  model_id: string;
  /** Thrown error message from runAgent(), or null on clean exit. */
  agent_error: string | null;
  /** Score from endTrial. Null if unavailable. 1.0 = perfect. */
  score: number | null;
  /** Per-task detail strings from endTrial (e.g. scoring breakdown). */
  score_detail: string[];
}

/**
 * Append a TaskMetric to the date-partitioned JSONL file.
 *
 * The caller provides everything except `schema` and `recorded_at`,
 * which are stamped automatically.
 *
 * @returns the full path written, or null on failure.
 */
export async function recordTask(
  input: Omit<TaskMetric, "schema" | "recorded_at">,
  basePath: string = DEFAULT_BASE_PATH
): Promise<string | null> {
  const now = new Date();
  const metric: TaskMetric = {
    schema: 1,
    recorded_at: now.toISOString(),
    ...input,
  };

  const date = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const path = `${basePath}/${date}.jsonl`;

  try {
    await mkdir(basePath, { recursive: true });
    await appendFile(path, JSON.stringify(metric) + "\n", "utf8");
    return path;
  } catch (err) {
    // Swallow — metrics must never break the agent path.
    process.stderr.write(
      `[metrics] Failed to write ${path}: ${err instanceof Error ? err.message : String(err)}\n`
    );
    return null;
  }
}
