// Poll GetRun on submitted run until score is finalised (state transitions
// from PENDING_EVAL → EVALUATED/DONE). Server-side eval typically takes a
// few seconds to a minute.

import { harness, GetRunRequest } from "../src/harness.js";

const RUN_ID = process.argv[2] ?? process.env.POLL_RUN_ID ?? "run-22HnQAt9aryV9t9Qg4j1kvAiZ";
const INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? "15000");
const MAX_ATTEMPTS = Number(process.env.POLL_MAX_ATTEMPTS ?? "40"); // 10 min

function ts() {
  return new Date().toISOString().slice(11, 19);
}

async function main() {
  console.log(`[${ts()}] poll-score starting. run=${RUN_ID}`);
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const run = await harness.getRun(new GetRunRequest({ runId: RUN_ID }));
      const score = run.score;
      const state = run.state;
      console.log(`[${ts()}] attempt=${attempt} state=${state} score=${score ?? "undef"}`);

      // State transitions: 1=RUNNING, 2=PENDING_EVAL, 3=EVALUATED/DONE
      if (score != null && score >= 0) {
        console.log(`[${ts()}] ======================================`);
        console.log(`[${ts()}] FINAL SCORE: ${score}`);
        console.log(`[${ts()}] ======================================`);
        process.exit(0);
      }
      if (state === 3) {
        console.log(`[${ts()}] state=3 but score undefined — unexpected, bailing`);
        process.exit(1);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[${ts()}] getRun failed: ${msg.slice(0, 200)}`);
    }
    if (attempt < MAX_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, INTERVAL_MS));
    }
  }
  console.error(`[${ts()}] GAVE UP after ${MAX_ATTEMPTS} attempts`);
  process.exit(1);
}

main();
