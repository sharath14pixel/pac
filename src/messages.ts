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
 * Returns a new array with middle messages removed (FIFO) to fit within token budget.
 *
 * Preserves the first `keepFirst` messages (bootstrap context) and
 * the last `keepLast` messages (recent context). Removes from the
 * oldest middle messages first.
 */
export function pruneMessages(
  messages: ModelMessage[],
  opts?: PruneOptions
): ModelMessage[] {
  const maxTokens = opts?.maxTokens ?? 100_000;
  const keepFirst = opts?.keepFirst ?? 4;
  const keepLast = opts?.keepLast ?? 10;

  // Nothing to prune if under budget
  if (estimateTokens(messages) < maxTokens) {
    return messages;
  }

  // Nothing to prune if head + tail cover all messages
  if (keepFirst + keepLast >= messages.length) {
    return messages;
  }

  const head = messages.slice(0, keepFirst);
  const middle = messages.slice(keepFirst, messages.length - keepLast);
  const tail = messages.slice(messages.length - keepLast);

  // Remove oldest middle messages first until under budget
  let remaining = [...middle];

  while (remaining.length > 0) {
    const candidate = [...head, SPLICE_MESSAGE, ...remaining, ...tail];
    if (estimateTokens(candidate) < maxTokens) {
      return candidate;
    }
    // Drop the oldest middle message
    remaining.shift();
  }

  // All middle messages removed — best effort
  return [...head, SPLICE_MESSAGE, ...tail];
}
