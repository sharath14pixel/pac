import { createPromiseClient } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-node";
import { HarnessService } from "@buf/bitgn_api.connectrpc_es/bitgn/harness_connect.js";
import {
  StatusRequest,
  GetBenchmarkRequest,
  StartPlaygroundRequest,
  StartRunRequest,
  StartTrialRequest,
  EndTrialRequest,
  GetRunRequest,
  SubmitRunRequest,
} from "@buf/bitgn_api.bufbuild_es/bitgn/harness_pb.js";
import { BENCHMARK_HOST, BITGN_API_KEY } from "./config.js";

const transport = createConnectTransport({
  baseUrl: BENCHMARK_HOST,
  httpVersion: "2",
  interceptors: [
    (next) => async (req) => {
      if (BITGN_API_KEY) {
        req.header.set("Authorization", `Bearer ${BITGN_API_KEY}`);
      }
      return next(req);
    },
  ],
});

export const harness = createPromiseClient(HarnessService, transport);

export function createRuntimeTransport(harnessUrl: string) {
  return createConnectTransport({
    baseUrl: harnessUrl,
    httpVersion: "2",
  });
}

export {
  StatusRequest,
  GetBenchmarkRequest,
  StartPlaygroundRequest,
  StartRunRequest,
  StartTrialRequest,
  EndTrialRequest,
  GetRunRequest,
  SubmitRunRequest,
};
