import { Code, ConnectError } from "@connectrpc/connect";

export interface RetryOptions {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
  retryOn?: (err: unknown) => boolean;
}

const TRANSIENT_CODES = new Set<Code>([
  Code.Unavailable,
  Code.DeadlineExceeded,
  Code.ResourceExhausted,
  Code.Aborted,
]);

const NON_TRANSIENT_CODES = new Set<Code>([
  Code.NotFound,
  Code.PermissionDenied,
  Code.InvalidArgument,
  Code.Unimplemented,
  Code.AlreadyExists,
]);

const TRANSIENT_PATTERNS = [
  "429",
  "529",
  "rate limit",
  "rate_limit",
  "rate-limit",
  "timeout",
  "econnreset",
  "etimedout",
  "overloaded",
  "overloaded_error",
  "service unavailable",
  "service_unavailable",
  "insufficient_quota",
  "bad gateway",
  "gateway timeout",
];

export function isTransientError(err: unknown): boolean {
  if (err instanceof ConnectError) {
    if (NON_TRANSIENT_CODES.has(err.code)) return false;
    if (TRANSIENT_CODES.has(err.code)) return true;
    return false;
  }

  const message =
    err instanceof Error ? err.message : typeof err === "string" ? err : "";
  return TRANSIENT_PATTERNS.some((p) => message.toLowerCase().includes(p));
}

function jitter(delay: number): number {
  const factor = 0.9 + Math.random() * 0.2; // ±10%
  return Math.round(delay * factor);
}

/**
 * Parse a Retry-After header value to milliseconds.
 * Accepts both delta-seconds (RFC 7231) and HTTP-date formats.
 * Returns null if the value cannot be parsed.
 */
function parseRetryAfter(value: unknown): number | null {
  if (typeof value !== "string" || value.length === 0) return null;
  const asNumber = Number(value);
  if (Number.isFinite(asNumber) && asNumber >= 0) {
    return Math.round(asNumber * 1000);
  }
  const asDate = Date.parse(value);
  if (!Number.isNaN(asDate)) {
    const diff = asDate - Date.now();
    return diff > 0 ? diff : 0;
  }
  return null;
}

/**
 * Extract Retry-After from an error that may be an AI SDK AI_APICallError
 * or an HTTP-like error with a headers object.
 */
function extractRetryAfterMs(err: unknown): number | null {
  if (!err || typeof err !== "object") return null;
  const e = err as { responseHeaders?: Record<string, string>; headers?: Record<string, string> };
  const headers = e.responseHeaders ?? e.headers;
  if (!headers) return null;
  // Try common header names (case-insensitive)
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === "retry-after") {
      return parseRetryAfter(headers[key]);
    }
  }
  return null;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts?: RetryOptions,
): Promise<T> {
  const maxRetries = opts?.maxRetries ?? 3;
  const baseDelay = opts?.baseDelay ?? 200;
  const maxDelay = opts?.maxDelay ?? 5000;
  const shouldRetry = opts?.retryOn ?? isTransientError;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      if (attempt >= maxRetries || !shouldRetry(err)) {
        throw err;
      }

      // Honour Retry-After if provider sent one — capped at maxDelay so
      // we never wait longer than the caller configured.
      const retryAfterMs = extractRetryAfterMs(err);
      const backoffMs = Math.min(baseDelay * 2 ** attempt, maxDelay);
      const rawDelay = retryAfterMs != null ? Math.min(retryAfterMs, maxDelay) : backoffMs;
      const delay = jitter(rawDelay);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // Unreachable — the loop either returns or throws
  throw lastError;
}
