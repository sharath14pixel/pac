import { createPromiseClient } from "@connectrpc/connect";
import type { Transport } from "@connectrpc/connect";
import { PcmRuntime } from "@buf/bitgn_api.connectrpc_es/bitgn/vm/pcm_connect.js";
import {
  ReadRequest,
  WriteRequest,
  DeleteRequest,
  MkDirRequest,
  MoveRequest,
  ListRequest,
  TreeRequest,
  FindRequest,
  FindRequest_Type,
  SearchRequest,
  ContextRequest,
  AnswerRequest,
  Outcome,
} from "@buf/bitgn_api.bufbuild_es/bitgn/vm/pcm_pb.js";
import type { ToolCall } from "./schema.js";

export function createRuntime(transport: Transport) {
  return createPromiseClient(PcmRuntime, transport);
}

export type PcmClient = ReturnType<typeof createRuntime>;

const FIND_TYPE_MAP: Record<string, FindRequest_Type> = {
  all: FindRequest_Type.ALL,
  files: FindRequest_Type.FILES,
  dirs: FindRequest_Type.DIRS,
};

const OUTCOME_MAP: Record<string, Outcome> = {
  OUTCOME_OK: Outcome.OK,
  OUTCOME_DENIED_SECURITY: Outcome.DENIED_SECURITY,
  OUTCOME_NONE_CLARIFICATION: Outcome.NONE_CLARIFICATION,
  OUTCOME_NONE_UNSUPPORTED: Outcome.NONE_UNSUPPORTED,
  OUTCOME_ERR_INTERNAL: Outcome.ERR_INTERNAL,
};

export async function dispatch(vm: PcmClient, cmd: ToolCall) {
  switch (cmd.tool) {
    case "context":
      return vm.context(new ContextRequest());
    case "tree":
      return vm.tree(new TreeRequest({ root: cmd.root, level: cmd.level }));
    case "find":
      return vm.find(
        new FindRequest({
          root: cmd.root,
          name: cmd.name,
          type: FIND_TYPE_MAP[cmd.kind] ?? FindRequest_Type.ALL,
          limit: cmd.limit,
        })
      );
    case "search":
      return vm.search(
        new SearchRequest({
          root: cmd.root,
          pattern: cmd.pattern,
          limit: cmd.limit,
        })
      );
    case "list":
      return vm.list(new ListRequest({ name: cmd.path }));
    case "read":
      return vm.read(
        new ReadRequest({
          path: cmd.path,
          number: cmd.number,
          startLine: cmd.start_line,
          endLine: cmd.end_line,
        })
      );
    case "write":
      return vm.write(
        new WriteRequest({
          path: cmd.path,
          content: cmd.content,
          startLine: cmd.start_line,
          endLine: cmd.end_line,
        })
      );
    case "delete":
      return vm.delete(new DeleteRequest({ path: cmd.path }));
    case "mkdir":
      return vm.mkDir(new MkDirRequest({ path: cmd.path }));
    case "move":
      return vm.move(
        new MoveRequest({ fromName: cmd.from_name, toName: cmd.to_name })
      );
    case "report_completion":
      return vm.answer(
        new AnswerRequest({
          message: cmd.message,
          outcome: OUTCOME_MAP[cmd.outcome] ?? Outcome.OK,
          refs: cmd.grounding_refs,
        })
      );
    default:
      throw new Error(`Unknown tool: ${(cmd as { tool: string }).tool}`);
  }
}

export { Outcome };
