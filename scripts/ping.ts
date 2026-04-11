import { harness, StatusRequest, GetBenchmarkRequest } from "../src/harness.js";
import { BENCHMARK_ID } from "../src/config.js";

async function main() {
  const status = await harness.status(new StatusRequest());
  console.log("STATUS:", status.status, "v" + status.version);
  const bench = await harness.getBenchmark(
    new GetBenchmarkRequest({ benchmarkId: BENCHMARK_ID }),
  );
  console.log("BENCHMARK:", bench.benchmarkId);
  console.log("POLICY:", bench.policy);
  console.log("TASKS:", bench.tasks.length);
  console.log(
    "FIRST 10 TASK IDS:",
    bench.tasks.slice(0, 10).map((t) => t.taskId).join(", "),
  );
  console.log("DESCRIPTION:", bench.description.slice(0, 300));
  console.log("\n--- Task samples ---");
  for (const t of bench.tasks.slice(0, 3)) {
    console.log(`\n[${t.taskId}]`);
    if (t.hint) console.log("  HINT:", t.hint.slice(0, 200));
  }
}

main().catch((err) => {
  console.error("ERROR:", err);
  process.exit(1);
});
