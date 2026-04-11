import { harness, StatusRequest, GetRunRequest, SubmitRunRequest } from "../src/harness.js";

async function main() {
  const RUN_ID = process.argv[2] ?? "run-22HnQAt9aryV9t9Qg4j1kvAiZ";
  console.log(`recover target: ${RUN_ID}`);

  try {
    const status = await harness.status(new StatusRequest());
    console.log(`status: ${status.status} v${status.version}`);
  } catch (err) {
    console.error(`status FAILED: ${err}`);
    return;
  }

  try {
    const run = await harness.getRun(new GetRunRequest({ runId: RUN_ID }));
    console.log(`run state=${run.state} trials=${run.trialIds?.length ?? "?"}`);
    console.log(`score=${run.score}`);
  } catch (err) {
    console.error(`getRun FAILED: ${err}`);
  }

  try {
    const res = await harness.submitRun(new SubmitRunRequest({ runId: RUN_ID, force: true }));
    console.log(`submitRun OK: state=${res.state}`);
  } catch (err) {
    console.error(`submitRun FAILED: ${err}`);
  }
}

main();
