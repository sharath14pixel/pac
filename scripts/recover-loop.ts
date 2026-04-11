// Auto-retry loop for submitRun when the BitGN harness has a transient server
// error (e.g., disk full). Tries every 60s until submitRun succeeds or max
// attempts reached. Only the finalizing submitRun call is retried — the
// underlying 72 completed trials are already in the server's in-memory state.

import { harness, StatusRequest, GetRunRequest, SubmitRunRequest } from "../src/harness.js";

const RUN_ID = process.env.RECOVER_RUN_ID ?? "run-22HnQAt9aryV9t9Qg4j1kvAiZ";
const INTERVAL_MS = Number(process.env.RECOVER_INTERVAL_MS ?? "60000");
const MAX_ATTEMPTS = Number(process.env.RECOVER_MAX_ATTEMPTS ?? "60"); // 1 hour

function ts() {
  return new Date().toISOString().slice(11, 19);
}

async function tryOnce(attempt: number): Promise<boolean> {
  console.log(`[${ts()}] attempt ${attempt}/${MAX_ATTEMPTS} — run=${RUN_ID}`);
  try {
    const status = await harness.status(new StatusRequest());
    console.log(`[${ts()}] status: ${status.status} v${status.version}`);
  } catch (err) {
    console.error(`[${ts()}] status failed: ${err}`);
    return false;
  }
  try {
    const run = await harness.getRun(new GetRunRequest({ runId: RUN_ID }));
    console.log(`[${ts()}] getRun: state=${run.state} score=${run.score ?? "undef"}`);
  } catch (err) {
    console.error(`[${ts()}] getRun failed: ${err}`);
  }
  try {
    const res = await harness.submitRun(new SubmitRunRequest({ runId: RUN_ID, force: true }));
    console.log(`[${ts()}] ======================================`);
    console.log(`[${ts()}] SUBMITRUN SUCCEEDED: state=${res.state}`);
    console.log(`[${ts()}] ======================================`);
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isDiskFull = msg.includes("no space left on device");
    const isTransient = msg.includes("failed to update") || msg.includes("failed to persist");
    console.error(`[${ts()}] submitRun failed: ${isDiskFull ? "DISK FULL" : isTransient ? "TRANSIENT" : "OTHER"} — ${msg.slice(0, 200)}`);
    return false;
  }
}

async function main() {
  console.log(`[${ts()}] recover-loop starting. run=${RUN_ID} interval=${INTERVAL_MS}ms max=${MAX_ATTEMPTS}`);
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const ok = await tryOnce(attempt);
    if (ok) {
      console.log(`[${ts()}] DONE — run submitted on attempt ${attempt}.`);
      process.exit(0);
    }
    if (attempt < MAX_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, INTERVAL_MS));
    }
  }
  console.error(`[${ts()}] GAVE UP after ${MAX_ATTEMPTS} attempts — manual intervention needed.`);
  process.exit(1);
}

main();
