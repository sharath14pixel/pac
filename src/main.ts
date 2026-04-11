import pLimit from "p-limit";
import { harness, StartPlaygroundRequest, GetBenchmarkRequest, StatusRequest, EndTrialRequest, StartRunRequest, StartTrialRequest, GetRunRequest, SubmitRunRequest } from "./harness.js";
import { BENCHMARK_ID, BITGN_API_KEY, CLI, CONCURRENCY, MODEL_ID } from "./config.js";
import { runAgent } from "./agent.js";
import { ConnectError } from "@connectrpc/connect";
import { EvalPolicy } from "@buf/bitgn_api.bufbuild_es/bitgn/harness_pb.js";
import { recordTask } from "./metrics.js";

// H4 Run-Metrics. Default on; set ENABLE_RUN_METRICS=false to disable.
const ENABLE_RUN_METRICS = process.env.ENABLE_RUN_METRICS !== "false";
const TRIAL_ID_PREFIX = `trial-${Date.now()}`;

const runAgentFn = runAgent;

async function main() {
  const taskFilter = process.argv.slice(2);
  // Session-mode is the DEFAULT. Playground is opt-in via --playground (or
  // PLAYGROUND=true env). Session runs call StartRun → visible in dashboard
  // "My Runs". Playground runs call StartPlayground → ad-hoc trial, NOT
  // attached to a leaderboard run (proto: harness.proto:294). The legacy
  // --session flag is a no-op kept for runbook / muscle-memory compatibility.
  const hasPlaygroundFlag = taskFilter.includes("--playground");
  const envPlayground = process.env.PLAYGROUND === "true";
  const isSession = !(hasPlaygroundFlag || envPlayground);
  const filteredTasks = taskFilter.filter((t) => !t.startsWith("--"));

  const scores: Array<{ taskId: string; score: number }> = [];
  let recorded = 0;

  try {
    // Connect
    const status = await harness.status(new StatusRequest());
    console.log(`Connected to BitGN: ${status.status} v${status.version}`);
    if (ENABLE_RUN_METRICS) {
      const metricsDate = new Date().toISOString().slice(0, 10);
      const metricsPath = process.env.RUN_METRICS_PATH ?? ".bitgn/runs";
      console.log(
        `${CLI.dim}[metrics] Recording to ${metricsPath}/${metricsDate}.jsonl${CLI.reset}`
      );
    }

    // Get benchmark
    const bench = await harness.getBenchmark(
      new GetBenchmarkRequest({ benchmarkId: BENCHMARK_ID })
    );
    console.log(
      `${EvalPolicy[bench.policy]} benchmark: ${bench.benchmarkId} with ${bench.tasks.length} tasks`
    );
    console.log(`${CLI.green}${bench.description}${CLI.reset}\n`);

    if (isSession) {
      // Full scored session via StartRun → run appears in dashboard "My Runs"
      console.log(`${CLI.dim}[mode] session (StartRun → visible in dashboard)${CLI.reset}`);
      recorded = await runSession(bench, filteredTasks, scores);
    } else {
      // Ad-hoc playground mode (StartPlayground). NOT attached to a leaderboard
      // run — invisible in dashboard "My Runs". Opt-in via --playground flag.
      console.log(`${CLI.dim}[mode] playground (ad-hoc trial, NOT in My Runs)${CLI.reset}`);
      recorded = await runPlayground(bench, filteredTasks, scores);
    }
  } catch (err) {
    if (err instanceof ConnectError) {
      console.error(`${CLI.red}${err.code}: ${err.message}${CLI.reset}`);
    } else {
      console.error(err);
    }
  }

  printScores(scores);
  if (ENABLE_RUN_METRICS) {
    console.log(
      `${CLI.dim}[metrics] ${recorded} task record(s) written${CLI.reset}`
    );
  }
}

async function runPlayground(
  bench: Awaited<ReturnType<typeof harness.getBenchmark>>,
  taskFilter: string[],
  scores: Array<{ taskId: string; score: number }>
): Promise<number> {
  let recorded = 0;
  for (const task of bench.tasks) {
    if (taskFilter.length > 0 && !taskFilter.includes(task.taskId)) continue;

    console.log(`${"=".repeat(30)} Starting task: ${task.taskId} ${"=".repeat(30)}`);

    const trial = await harness.startPlayground(
      new StartPlaygroundRequest({
        benchmarkId: BENCHMARK_ID,
        taskId: task.taskId,
      })
    );

    console.log(`${CLI.blue}${trial.instruction}${CLI.reset}`);
    console.log("-".repeat(80));

    const startedAt = Date.now();
    let agentError: string | null = null;
    try {
      await runAgentFn(trial.harnessUrl, trial.instruction, task.hint || undefined);
    } catch (err) {
      agentError = err instanceof Error ? err.message : String(err);
      console.error(`${CLI.red}Agent error: ${err}${CLI.reset}`);
    }
    const endedAt = Date.now();

    const result = await harness.endTrial(
      new EndTrialRequest({ trialId: trial.trialId })
    );

    let scoreValue: number | null = null;
    let scoreDetail: string[] = [];
    if (result.score != null && result.score >= 0) {
      scoreValue = result.score;
      scoreDetail = result.scoreDetail ?? [];
      scores.push({ taskId: task.taskId, score: result.score });
      const style = result.score === 1 ? CLI.green : CLI.red;
      const detail = scoreDetail.map((d) => `  ${d}`).join("\n");
      console.log(`\n${style}Score: ${result.score.toFixed(2)}\n${detail}\n${CLI.reset}`);
    }

    // Issue #41 — record run metrics
    if (ENABLE_RUN_METRICS) {
      try {
        const written = await recordTask({
          run_id: null,
          trial_id: trial.trialId,
          task_id: task.taskId,
          started_at: new Date(startedAt).toISOString(),
          ended_at: new Date(endedAt).toISOString(),
          duration_ms: endedAt - startedAt,
          session_type: "playground",
          model_id: MODEL_ID,
          agent_error: agentError,
          score: scoreValue,
          score_detail: scoreDetail,
        });
        if (written) recorded++;
      } catch (metricsErr) {
        // Never let metrics break the run.
        console.error(`${CLI.dim}metrics error: ${metricsErr}${CLI.reset}`);
      }
    }
  }
  return recorded;
}

type TrialResult = {
  trialId: string;
  taskId: string | null;
  score: number | null;
  scoreDetail: string[];
  agentError: string | null;
  skipped: boolean;
  recordedMetric: boolean;
};

async function processTrial(
  trialId: string,
  bench: Awaited<ReturnType<typeof harness.getBenchmark>>,
  run: Awaited<ReturnType<typeof harness.startRun>>,
  taskFilter: string[],
): Promise<TrialResult> {
  const trial = await harness.startTrial(
    new StartTrialRequest({ trialId })
  );

  if (taskFilter.length > 0 && !taskFilter.includes(trial.taskId)) {
    await harness.endTrial(new EndTrialRequest({ trialId }));
    return {
      trialId,
      taskId: trial.taskId,
      score: null,
      scoreDetail: [],
      agentError: null,
      skipped: true,
      recordedMetric: false,
    };
  }

  console.log(`[${trialId}] ${"=".repeat(20)} Trial: ${trial.taskId} ${"=".repeat(20)}`);
  console.log(`${CLI.blue}${trial.instruction}${CLI.reset}`);
  console.log("-".repeat(80));

  const taskHint = bench.tasks.find((t) => t.taskId === trial.taskId)?.hint || undefined;
  const startedAt = Date.now();
  let agentError: string | null = null;
  try {
    await runAgentFn(trial.harnessUrl, trial.instruction, taskHint);
  } catch (err) {
    agentError = err instanceof Error ? err.message : String(err);
    console.error(`${CLI.red}[${trialId}] Agent error: ${err}${CLI.reset}`);
  }
  const endedAt = Date.now();

  const result = await harness.endTrial(
    new EndTrialRequest({ trialId })
  );

  let scoreValue: number | null = null;
  let scoreDetail: string[] = [];
  if (result.score != null && result.score >= 0) {
    scoreValue = result.score;
    scoreDetail = result.scoreDetail ?? [];
    const style = result.score === 1 ? CLI.green : CLI.red;
    console.log(`[${trialId}] ${style}Score: ${result.score.toFixed(2)}${CLI.reset}`);
  }

  // Issue #41 — record run metrics
  let recordedMetric = false;
  if (ENABLE_RUN_METRICS) {
    try {
      const written = await recordTask({
        run_id: run.runId,
        trial_id: trialId,
        task_id: trial.taskId,
        started_at: new Date(startedAt).toISOString(),
        ended_at: new Date(endedAt).toISOString(),
        duration_ms: endedAt - startedAt,
        session_type: "session",
        model_id: MODEL_ID,
        agent_error: agentError,
        score: scoreValue,
        score_detail: scoreDetail,
      });
      if (written) recordedMetric = true;
    } catch (metricsErr) {
      // Never let metrics break the run.
      console.error(`${CLI.dim}[${trialId}] metrics error: ${metricsErr}${CLI.reset}`);
    }
  }

  return {
    trialId,
    taskId: trial.taskId,
    score: scoreValue,
    scoreDetail,
    agentError,
    skipped: false,
    recordedMetric,
  };
}

async function runSession(
  bench: Awaited<ReturnType<typeof harness.getBenchmark>>,
  taskFilter: string[],
  scores: Array<{ taskId: string; score: number }>
): Promise<number> {
  // Schema update 2026-04-10 (buf commit 90b581d3f32f): StartRunRequest
  // requires `api_key` in the BODY (not as Authorization header) to associate
  // the run with the caller's profile. Without it the server returns
  // `unauthenticated: missing BitGN API Key. Get it in your profile`.
  const run = await harness.startRun(
    new StartRunRequest({
      benchmarkId: BENCHMARK_ID,
      name: `pac-agent-${Date.now()}`,
      apiKey: BITGN_API_KEY,
    })
  );
  console.log(`Started run: ${run.runId} with ${run.trialIds.length} trials`);

  const limit = pLimit(CONCURRENCY);
  if (CONCURRENCY > 1) {
    console.log(`${CLI.dim}[concurrency] running up to ${CONCURRENCY} trials in parallel${CLI.reset}`);
  }

  const settled = await Promise.allSettled(
    run.trialIds.map((trialId) => limit(() => processTrial(trialId, bench, run, taskFilter))),
  );

  let recorded = 0;
  let errors = 0;
  for (const s of settled) {
    if (s.status === "rejected") {
      errors++;
      console.error(`${CLI.red}Trial crashed: ${s.reason}${CLI.reset}`);
      continue;
    }
    const r = s.value;
    if (r.skipped) continue;
    if (r.recordedMetric) recorded++;
    if (r.score != null) scores.push({ taskId: r.taskId ?? r.trialId, score: r.score });
  }
  if (errors > 0) {
    console.error(`${CLI.red}[trial errors] ${errors} trial(s) rejected — see logs above${CLI.reset}`);
  }

  // Submit run
  const submitted = await harness.submitRun(
    new SubmitRunRequest({ runId: run.runId, force: true })
  );
  console.log(`\nRun submitted: ${run.runId} — state: ${submitted.state}`);

  return recorded;
}

function printScores(scores: Array<{ taskId: string; score: number }>) {
  if (scores.length === 0) return;

  console.log(`\n${"=".repeat(60)}`);
  console.log("RESULTS:");
  for (const { taskId, score } of scores) {
    const style = score === 1 ? CLI.green : CLI.red;
    console.log(`  ${taskId}: ${style}${score.toFixed(2)}${CLI.reset}`);
  }

  const total = (scores.reduce((sum, s) => sum + s.score, 0) / scores.length) * 100;
  const totalStyle = total >= 70 ? CLI.green : total >= 40 ? CLI.yellow : CLI.red;
  console.log(`\n  ${totalStyle}FINAL: ${total.toFixed(2)}%${CLI.reset}`);
}

main();
