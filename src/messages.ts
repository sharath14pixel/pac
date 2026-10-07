import type { ModelMessage } from "ai";

export interface PruneOptions {
  maxTokens?: number;
  keepFirst?: number;
  keepLast?: number;
}

/**
 * Rough token estimation: ~0.25 tokens per character.
 * Walks all messages, serializes content to string, sums character counts.
 */
export function estimateTokens(messages: ModelMessage[]): number {
  let totalChars = 0;

  for (const msg of messages) {
    if (typeof msg.content === "string") {
      totalChars += msg.content.length;
    } else if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        totalChars += JSON.stringify(part).length;
      }
    } else if (msg.content !== undefined && msg.content !== null) {
      totalChars += JSON.stringify(msg.content).length;
    }
  }

  return Math.ceil(totalChars / 4);
}

const SPLICE_MESSAGE: ModelMessage = {
  role: "user",
  content:
    "[Earlier tool calls pruned to fit context window. Continue with the task.]",
};

/**
 * Groups messages into conversational turns.
 * An assistant message with tool calls and the following tool message form an atomic turn
 * that must never be severed.
 */
function groupIntoTurns(messages: ModelMessage[]): ModelMessage[][] {
  const turns: ModelMessage[][] = [];
  let i = 0;
  while (i < messages.length) {
    const current = messages[i];
    if (
      current.role === "assistant" &&
      i + 1 < messages.length &&
      messages[i + 1].role === "tool"
    ) {
      turns.push([current, messages[i + 1]]);
      i += 2;
    } else {
      turns.push([current]);
      i += 1;
    }
  }
  return turns;
}

/**
 * Returns a new array with middle turns removed (FIFO) to fit within token budget.
 *
 * Preserves the first `keepFirst` messages (bootstrap context) and
 * the last `keepLast` messages (recent context) while ensuring tool calls
 * and matching tool results are never broken apart.
 */
export function pruneMessages(
  messages: ModelMessage[],
  opts?: PruneOptions
): ModelMessage[] {
  const maxTokens = opts?.maxTokens ?? 100_000;

  // Nothing to prune if under budget
  if (estimateTokens(messages) < maxTokens) {
    return messages;
  }

  const turns = groupIntoTurns(messages);
  const keepFirstTurns = Math.max(1, Math.floor((opts?.keepFirst ?? 4) / 2));
  const keepLastTurns = Math.max(1, Math.floor((opts?.keepLast ?? 10) / 2));

  // Nothing to prune if head + tail cover all turns
  if (keepFirstTurns + keepLastTurns >= turns.length) {
    return messages;
  }

  const head = turns.slice(0, keepFirstTurns).flat();
  const middleTurns = turns.slice(keepFirstTurns, turns.length - keepLastTurns);
  const tail = turns.slice(turns.length - keepLastTurns).flat();

  let remainingTurns = [...middleTurns];

  while (remainingTurns.length > 0) {
    const candidate = [...head, SPLICE_MESSAGE, ...remainingTurns.flat(), ...tail];
    if (estimateTokens(candidate) < maxTokens) {
      return candidate;
    }
    // Drop the oldest middle turn atomically
    remainingTurns.shift();
  }

  // All middle turns removed — best effort
  return [...head, SPLICE_MESSAGE, ...tail];
}
