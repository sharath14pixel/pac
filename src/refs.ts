// ── Grounding-refs self-validation for BitGN PAC agent ─────────────
// Pure functions — no external dependencies, no imports from other project files.
//
// Scope: before report_completion is dispatched, verify each entry in
// grounding_refs corresponds to a path the agent actually visited during
// this task (via tool call) OR a path explicitly mentioned in the task
// instruction text. This is defensive — BitGN stores refs verbatim and
// does not resolve them (proto comment), but self-validation prevents
// hallucinated citations from polluting the audit trail.
//
// Design principle: recoverable errors, not hard failures. The agent gets
// a tool-error telling it exactly which refs were rejected so it can retry
// report_completion with corrected refs. Max 3 rejections per task, then
// pass-through with a logged warning (better to submit than stall).

import type { ToolCall } from "./schema.js";

// ── Types ────────────────────────────────────────────────────────────

export interface RefsValidationResult {
  ok: boolean;
  /** Refs that were not found in the visited set. */
  unknownRefs: string[];
  /** Human-readable error message formatted for the agent. */
  error?: string;
}

// ── Path normalization (shared style with paths.ts) ─────────────────

/**
 * Normalizes a path for comparison: lowercase, collapse slashes, strip
 * trailing slash. Leading slash preserved.
 */
function normalize(p: string): string {
  if (!p) return "";
  let n = p.trim().toLowerCase();
  n = n.replace(/\\/g, "/");
  n = n.replace(/\/+/g, "/");
  if (n.length > 1 && n.endsWith("/")) n = n.slice(0, -1);
  // Always emit leading slash so relative citations ("foo/bar.md") and
  // absolute visited entries ("/foo/bar.md") share a namespace.
  // Single "/" stays as "/".
  if (n.length > 0 && !n.startsWith("/")) n = "/" + n;
  return n;
}

// ── Extraction helpers ──────────────────────────────────────────────

/**
 * Returns the path-like arguments of a tool call. For tools with no path
 * arguments (context, report_completion), returns an empty array.
 */
export function extractPathArgs(cmd: ToolCall): string[] {
  switch (cmd.tool) {
    case "read":
    case "write":
    case "delete":
    case "mkdir":
    case "list":
      return cmd.path ? [cmd.path] : [];
    case "tree":
    case "find":
    case "search":
      return cmd.root ? [cmd.root] : [];
    case "move":
      return [cmd.from_name, cmd.to_name].filter((s): s is string => !!s);
    case "context":
    case "report_completion":
      return [];
  }
}

/**
 * Extracts path-shaped substrings from arbitrary text (e.g. the task
 * instruction). Matches absolute paths starting with `/` followed by at
 * least one alphanumeric char. Used to seed the "visited" set with paths
 * the task itself references, so the agent can legitimately cite them
 * even without actively reading.
 *
 * Pattern: /[alphanum][pathchars]* optionally with trailing file extension.
 */
const PATH_RE = /\/[A-Za-z0-9][A-Za-z0-9_./-]*/g;

export function extractPathsFromText(text: string): string[] {
  if (!text) return [];
  const matches = text.match(PATH_RE);
  if (!matches) return [];
  return matches.map((m) => m);
}

// ── Visited set API ─────────────────────────────────────────────────

/**
 * Build the initial visited set for a task. Includes:
 * - /AGENTS.md (always read during bootstrap)
 * - Any path-shaped strings in the task text itself (legit citations)
 *
 * Callers should further populate the set as tool calls dispatch.
 */
export function initialVisitedSet(taskText: string): Set<string> {
  const set = new Set<string>();
  set.add(normalize("/AGENTS.md"));
  // Seed root so `tree /` and grounding_refs: ["/"] always match.
  set.add("/");
  for (const p of extractPathsFromText(taskText)) {
    set.add(normalize(p));
  }
  return set;
}

/**
 * Add the path args of a tool call to the visited set.
 */
export function trackVisitedFromCall(
  visited: Set<string>,
  cmd: ToolCall
): void {
  for (const p of extractPathArgs(cmd)) {
    visited.add(normalize(p));
  }
}

// ── Validation ──────────────────────────────────────────────────────

/**
 * Checks that each ref is present in the visited set (after normalization).
 * A ref is accepted if:
 *  - Its normalized form is in visited, OR
 *  - Any visited path is a prefix of the normalized ref (handles cases where
 *    the agent cites a specific file it wrote inside a directory it touched
 *    via list/tree), OR
 *  - The normalized ref is a prefix of any visited path (handles cases where
 *    the task text references a dir and the agent legitimately cites that
 *    dir even though it actually read a file inside it).
 */
export function validateGroundingRefs(
  refs: readonly string[],
  visited: ReadonlySet<string>
): RefsValidationResult {
  if (!refs || refs.length === 0) {
    // Missing grounding refs is a penalty upstream, but that's not our
    // problem here — we only validate the ones present.
    return { ok: true, unknownRefs: [] };
  }

  const unknown: string[] = [];
  for (const raw of refs) {
    const ref = normalize(raw);
    if (!ref) continue;

    if (visited.has(ref)) continue;

    let matched = false;
    for (const v of visited) {
      if (!v) continue;
      if (ref.startsWith(v + "/") || v.startsWith(ref + "/")) {
        matched = true;
        break;
      }
    }
    if (!matched) unknown.push(raw);
  }

  if (unknown.length === 0) {
    return { ok: true, unknownRefs: [] };
  }

  const visitedList = Array.from(visited).slice(0, 20).join(", ");
  return {
    ok: false,
    unknownRefs: unknown,
    error:
      `REFS VALIDATION: The following grounding_refs were not touched during this task and are not mentioned in the task instruction: ${unknown.join(", ")}. ` +
      `Use only refs from paths you actually read/wrote/listed OR paths explicitly named in the task instruction. Visited so far: ${visitedList}. ` +
      `Retry report_completion with corrected grounding_refs.`,
  };
}
