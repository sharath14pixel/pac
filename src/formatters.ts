import type {
  TreeResponse,
  TreeResponse_Entry,
  ListResponse,
  ReadResponse,
  SearchResponse,
  FindResponse,
  ContextResponse,
} from "@buf/bitgn_api.bufbuild_es/bitgn/vm/pcm_pb.js";
import type { ToolCall } from "./schema.js";
import { redactSecrets } from "./redaction.js";
import { ENABLE_SECRET_REDACTION } from "./config.js";

/**
 * Track B5 — Apply secret redaction to file-content body strings before they
 * flow into LLM context. Called only from read/search formatters where the
 * body is arbitrary untrusted content. Tree/list/find return structural data
 * (path lists, directory entries) so we do not redact them.
 */
function redactIfEnabled(body: string): string {
  if (!ENABLE_SECRET_REDACTION) return body;
  const result = redactSecrets(body);
  if (result.hits.length > 0) {
    // Log to stderr-ish path via console.log — keeps redaction observable
    // without leaking the redacted value itself.
    // eslint-disable-next-line no-console
    console.log(`  ⚠ SECRET REDACTION hit: ${result.hits.join(", ")}`);
  }
  return result.text;
}

function formatTreeEntry(
  entry: TreeResponse_Entry,
  prefix = "",
  isLast = true
): string[] {
  const branch = isLast ? "└── " : "├── ";
  const lines = [`${prefix}${branch}${entry.name}`];
  const childPrefix = `${prefix}${isLast ? "    " : "│   "}`;
  const children = entry.children;
  for (let i = 0; i < children.length; i++) {
    lines.push(
      ...formatTreeEntry(children[i], childPrefix, i === children.length - 1)
    );
  }
  return lines;
}

function formatTree(
  cmd: Extract<ToolCall, { tool: "tree" }>,
  result: TreeResponse
): string {
  const root = result.root;
  if (!root?.name) return render("tree /", ".");

  const lines = [root.name];
  const children = root.children;
  for (let i = 0; i < children.length; i++) {
    lines.push(
      ...formatTreeEntry(children[i], "", i === children.length - 1)
    );
  }

  const rootArg = cmd.root || "/";
  const levelArg = cmd.level > 0 ? ` -L ${cmd.level}` : "";
  return render(`tree${levelArg} ${rootArg}`, lines.join("\n"));
}

function formatList(
  cmd: Extract<ToolCall, { tool: "list" }>,
  result: ListResponse
): string {
  if (!result.entries.length) return render(`ls ${cmd.path}`, ".");
  const body = result.entries
    .map((e) => (e.isDir ? `${e.name}/` : e.name))
    .join("\n");
  return render(`ls ${cmd.path}`, body);
}

function formatRead(
  cmd: Extract<ToolCall, { tool: "read" }>,
  result: ReadResponse
): string {
  let command: string;
  if (cmd.start_line > 0 || cmd.end_line > 0) {
    const start = cmd.start_line > 0 ? cmd.start_line : 1;
    const end = cmd.end_line > 0 ? cmd.end_line : "$";
    command = `sed -n '${start},${end}p' ${cmd.path}`;
  } else if (cmd.number) {
    command = `cat -n ${cmd.path}`;
  } else {
    command = `cat ${cmd.path}`;
  }
  return render(command, redactIfEnabled(result.content));
}

function formatSearch(
  cmd: Extract<ToolCall, { tool: "search" }>,
  result: SearchResponse
): string {
  const root = cmd.root || "/";
  const body = result.matches
    .map((m) => `${m.path}:${m.line}:${m.lineText}`)
    .join("\n");
  return render(`rg -n --no-heading -e '${cmd.pattern}' ${root}`, redactIfEnabled(body));
}

function formatFind(
  cmd: Extract<ToolCall, { tool: "find" }>,
  result: FindResponse
): string {
  return render(
    `find ${cmd.root} -name '${cmd.name}'`,
    result.items.join("\n")
  );
}

function formatContext(result: ContextResponse): string {
  return render("context", `time: ${result.time}\nunix: ${result.unixTime}`);
}

function render(command: string, body: string): string {
  return `${command}\n${body}`;
}

export function formatResult(cmd: ToolCall, result: unknown): string {
  if (result == null) return "{}";

  switch (cmd.tool) {
    case "tree":
      return formatTree(cmd, result as TreeResponse);
    case "list":
      return formatList(cmd, result as ListResponse);
    case "read":
      return formatRead(cmd, result as ReadResponse);
    case "search":
      return formatSearch(cmd, result as SearchResponse);
    case "find":
      return formatFind(cmd, result as FindResponse);
    case "context":
      return formatContext(result as ContextResponse);
    default:
      return JSON.stringify(result, null, 2);
  }
}
