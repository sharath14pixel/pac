// ── Security module for BitGN PAC agent ──────────────────────────────
// Pure functions — no external dependencies, no imports from other project files.

// ── Types ────────────────────────────────────────────────────────────

export interface InjectionResult {
  detected: boolean;
  patterns: string[];
  severity: "none" | "low" | "high";
}

export interface DomainValidation {
  match: boolean;
  senderDomain: string;
  knownDomain: string;
}

// ── Injection detection ──────────────────────────────────────────────

const INJECTION_PATTERNS: readonly string[] = [
  "ignore previous instructions",
  "ignore all previous",
  "forget your instructions",
  "disregard your instructions",
  "act as a different agent",
  "you are now",
  "new instructions:",
  "override:",
  "system prompt:",
  "send data to",
  "forward secrets",
  "exfiltrate",
  "send me your api key",
  "relay via",
  "authenticated request",
  "marked as trusted",
  // HTML comment injection patterns (t09-style attacks)
  "internal relay",
  "operational note",
  "trusted queue",
  "active control path",
  "embedded instructions",
  "process the embedded",
  "send it back through the bridge",
] as const;

/** Patterns that always indicate credential/secret extraction attempts. */
const HIGH_SEVERITY_PATTERNS: readonly string[] = [
  "forward secrets",
  "exfiltrate",
  "send me your api key",
  "send data to",
  "relay via",
] as const;

/**
 * Common injection phrases that might appear base64-encoded inside file content.
 * We decode any base64 segments and check for these keywords.
 */
const BASE64_INJECTION_KEYWORDS: readonly string[] = [
  "ignore previous",
  "ignore all previous",
  "forget your instructions",
  "disregard your instructions",
  "system prompt",
  "override",
  "exfiltrate",
  "forward secrets",
  "send me your api key",
] as const;

/** Matches plausible base64 segments (at least 16 chars, valid alphabet + padding). */
const BASE64_SEGMENT_RE = /[A-Za-z0-9+/]{16,}={0,2}/g;

function isValidBase64(segment: string): boolean {
  // Length must be a multiple of 4 for proper base64.
  if (segment.length % 4 !== 0) return false;
  try {
    const decoded = Buffer.from(segment, "base64").toString("utf-8");
    // If it round-trips back to the same base64, it's legitimate base64.
    // Also accept it if the decoded string is mostly printable ASCII.
    const printable = /^[\x20-\x7E\t\n\r]+$/.test(decoded);
    return printable;
  } catch {
    return false;
  }
}

function checkBase64Injections(text: string): string[] {
  const matches: string[] = [];
  const segments = text.match(BASE64_SEGMENT_RE);
  if (!segments) return matches;

  for (const segment of segments) {
    if (!isValidBase64(segment)) continue;
    let decoded: string;
    try {
      decoded = Buffer.from(segment, "base64").toString("utf-8").toLowerCase();
    } catch {
      continue;
    }
    for (const keyword of BASE64_INJECTION_KEYWORDS) {
      if (decoded.includes(keyword)) {
        matches.push(`base64-encoded: "${keyword}"`);
      }
    }
  }

  return matches;
}

/**
 * Scans text for prompt injection patterns.
 *
 * High severity: multiple pattern matches OR any explicit credential/secret
 * extraction attempt.
 * Low severity: single ambiguous pattern match.
 */
export function scanForInjection(text: string): InjectionResult {
  const lower = text.toLowerCase();
  const matched: string[] = [];

  for (const pattern of INJECTION_PATTERNS) {
    if (lower.includes(pattern)) {
      matched.push(pattern);
    }
  }

  // Check for base64-encoded injection phrases.
  const base64Hits = checkBase64Injections(text);
  matched.push(...base64Hits);

  if (matched.length === 0) {
    return { detected: false, patterns: [], severity: "none" };
  }

  // Determine severity.
  const hasHighSeverityPattern = matched.some(
    (m) =>
      HIGH_SEVERITY_PATTERNS.some((h) => m.includes(h)),
  );
  const isHigh = hasHighSeverityPattern || matched.length > 1;

  return {
    detected: true,
    patterns: matched,
    severity: isHigh ? "high" : "low",
  };
}

// ── Email domain validation ──────────────────────────────────────────

function extractDomain(email: string): string {
  const atIndex = email.lastIndexOf("@");
  if (atIndex === -1) return "";
  return email.slice(atIndex + 1).toLowerCase().trim();
}

/**
 * @internal UNWIRED — available for phishing domain-mismatch detection. Not currently called;
 * wire into a pre-dispatch check on email-content reads if Cat-C forensics reveals phishing patterns.
 *
 * Validates that the sender's email domain matches the known contact's
 * email domain. Catches phishing attempts where the domain is subtly
 * different (e.g. `company.biz` vs `company.example.com`).
 */
export function validateEmailDomain(
  senderEmail: string,
  knownContactEmail: string,
): DomainValidation {
  const senderDomain = extractDomain(senderEmail);
  const knownDomain = extractDomain(knownContactEmail);

  return {
    match: senderDomain === knownDomain,
    senderDomain,
    knownDomain,
  };
}

// ── Unsupported feature detection ────────────────────────────────────

const UNSUPPORTED_PATTERNS: readonly RegExp[] = [
  /\bsync(?:ing|ed|s)?\s+(?:to|with)\s+\w/i,
  /\bsalesforce\b/i,
  /\bhubspot\b/i,
  /\bcrm\b/i,
  /\bpublish(?:ing|ed|es)?\s+to\s+(?:https?:\/\/|url|endpoint)/i,
  /\bsend\s+(?:an?\s+)?https?\s+request/i,
  /\bhttp\s+(?:get|post|put|patch|delete)\s+request/i,
  /\bmake\s+(?:an?\s+)?api\s+call/i,
  /\bcall\s+(?:the\s+)?(?:external\s+)?api\b/i,
  /\bsend\s+(?:an?\s+)?email\b(?!.*\boutbox\b)/i,
  /\bwebhook\b/i,
  /\bexternal\s+(?:service|endpoint|api)\b/i,
  /\bpush\s+(?:to|data\s+to)\s+(?:https?:\/\/|remote|cloud)/i,
] as const;

/**
 * Wired into pre-LLM task check in agent.ts.
 *
 * Returns `true` if the task text requests a capability that does not
 * exist in the PCM runtime (file-based system). These should be
 * answered with `OUTCOME_NONE_UNSUPPORTED`, NOT `OUTCOME_DENIED_SECURITY`.
 */
export function isUnsupportedFeature(taskText: string): boolean {
  return UNSUPPORTED_PATTERNS.some((re) => re.test(taskText));
}

