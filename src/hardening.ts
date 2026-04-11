// Shared Track-B hardening facade. Re-exports every defense module through a
// single import path and exposes shared constants + a per-task state bag.
// The agent loop consumes this facade instead of importing the underlying
// modules directly so a fix to any defense layer lands in one place.

import { initialVisitedSet as _initialVisitedSet } from "./refs.js";

export { validateToolCallPaths } from "./paths.js";
export {
  validateGroundingRefs,
  initialVisitedSet,
  trackVisitedFromCall,
} from "./refs.js";
export { detectPersonalInfoQuery } from "./pii.js";
export { redactSecrets } from "./redaction.js";
export { scanForInjection } from "./security.js";

// Shared constants — hardcoded in src/agent.ts, extracted here so the SDK path
// sees the same values.
export const DESTRUCTIVE_TOOLS: ReadonlySet<string> = new Set([
  "write",
  "delete",
  "move",
]);
export const DESTRUCTIVE_BRAKE_THRESHOLD = 10;
export const REFS_REJECTION_CAP = 3;
export const READ_SEARCH_TOOLS: ReadonlySet<string> = new Set([
  "read",
  "search",
  "find",
  "list",
  "tree",
]);

// Per-task state bag consumed by the SDK-path hardening layers. Fields
// default to safe-neutral values; callers instantiate fresh per task.
export interface HardeningState {
  visitedPaths: Set<string>;
  destructiveCount: number;
  destructiveNudgeFired: boolean;
  refsRejectCount: number;
  totalReadSearchCount: number;
  spiralHardCapFired: boolean;
}

export function createHardeningState(
  taskText: string,
  refsEnabled: boolean,
): HardeningState {
  return {
    visitedPaths: refsEnabled ? _initialVisitedSet(taskText) : new Set<string>(),
    destructiveCount: 0,
    destructiveNudgeFired: false,
    refsRejectCount: 0,
    totalReadSearchCount: 0,
    spiralHardCapFired: false,
  };
}
